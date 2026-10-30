// filepath: apps/web/src/shared/ui/index.tsx - 버튼, 입력창, 모달, 알림, 로딩 및 페이지네이션 공통 UI
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState
} from "react";

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode
} from "react";

// ============================================================
// 공통 버튼
// ============================================================

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {

  variant?: "primary" | "secondary" | "danger";

  loading?: boolean;
}

export function Button({
  children,
  variant = "primary",
  loading = false,
  disabled,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {

  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading}
      className={`sk-button sk-button-${variant} ${className}`}
    >
      {loading ? (
        <>
          <span
            className="sk-spinner"
            aria-hidden="true"
          />
          처리 중...
        </>
      ) : children}
    </button>
  );
}

// ============================================================
// 공통 입력창
// ============================================================

export interface TextFieldProps
  extends InputHTMLAttributes<HTMLInputElement> {

  label: string;

  error?: string;

  hint?: string;
}

export function TextField({
  label,
  error,
  hint,
  id,
  className = "",
  ...props
}: TextFieldProps) {

  const generatedId = useId();

  const inputId = id ?? generatedId;

  const messageId = `${inputId}-message`;

  return (
    <div className={`sk-field ${className}`}>

      <label
        htmlFor={inputId}
        className="sk-label"
      >
        {label}
      </label>

      <input
        {...props}
        id={inputId}
        className="sk-input"
        aria-invalid={Boolean(error)}
        aria-describedby={
          error || hint
            ? messageId
            : undefined
        }
      />

      {error ? (
        <p
          id={messageId}
          className="sk-field-error"
          role="alert"
        >
          {error}
        </p>
      ) : hint ? (
        <p
          id={messageId}
          className="sk-field-hint"
        >
          {hint}
        </p>
      ) : null}

    </div>
  );
}

// ============================================================
// 공통 로딩 표시
// ============================================================

export function Loading({
  message = "불러오는 중입니다."
}: {
  message?: string;
}) {

  return (
    <div
      className="sk-loading"
      role="status"
      aria-live="polite"
    >
      <span
        className="sk-spinner"
        aria-hidden="true"
      />

      <span>{message}</span>
    </div>
  );
}

// ============================================================
// 공통 빈 데이터 표시
// ============================================================

export function EmptyState({
  title,
  description
}: {
  title: string;
  description?: string;
}) {

  return (
    <div className="sk-empty" role="status">

      <strong>{title}</strong>

      {description && (
        <p>{description}</p>
      )}

    </div>
  );
}

// ============================================================
// 공통 모달
// ============================================================

// 브라우저 기본 dialog 요소를 사용합니다.
// ESC 키, 배경 차단, 포커스 이동 기능을 활용합니다.

export function Modal({
  open,
  title,
  children,
  onClose
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {

  const dialogRef = useRef<HTMLDialogElement>(null);

  const titleId = useId();

  useEffect(() => {

    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    }

    if (!open && dialog.open) {
      dialog.close();
    }

    return () => {

      if (dialog.open) {
        dialog.close();
      }
    };

  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="sk-modal"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >

      <div className="sk-modal-header">

        <h2 id={titleId}>
          {title}
        </h2>

        <button
          type="button"
          className="sk-modal-close"
          onClick={onClose}
          aria-label="모달 닫기"
        >
          ×
        </button>

      </div>

      <div className="sk-modal-body">
        {children}
      </div>

    </dialog>
  );
}

// ============================================================
// 공통 알림 메시지
// ============================================================

export type ToastVariant =
  | "success"
  | "error"
  | "info";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {

  notify: (
    message: string,
    variant?: ToastVariant
  ) => void;

  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(
  null
);

export function ToastProvider({
  children
}: {
  children: ReactNode;
}) {

  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const nextId = useRef(0);

  const timers = useRef(
    new Map<number, ReturnType<typeof setTimeout>>()
  );

  const dismiss = useCallback((id: number) => {

    const timer = timers.current.get(id);

    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }

    setToasts((current) =>
      current.filter((item) => item.id !== id)
    );

  }, []);

  const notify = useCallback((
    message: string,
    variant: ToastVariant = "info"
  ) => {

    nextId.current += 1;

    const id = nextId.current;

    setToasts((current) => [
      ...current,
      {
        id,
        message,
        variant
      }
    ]);

    const timer = setTimeout(() => {

      dismiss(id);

    }, 4000);

    timers.current.set(id, timer);

  }, [dismiss]);

  // 컴포넌트 종료 시 타이머를 정리합니다.
  useEffect(() => {

    const activeTimers = timers.current;

    return () => {

      for (const timer of activeTimers.values()) {
        clearTimeout(timer);
      }

      activeTimers.clear();
    };

  }, []);

  return (
    <ToastContext.Provider
      value={{
        notify,
        dismiss
      }}
    >

      {children}

      <div
        className="sk-toast-region"
        aria-live="polite"
        aria-label="알림 메시지"
      >

        {toasts.map((toast) => (

          <div
            key={toast.id}
            className={`sk-toast sk-toast-${toast.variant}`}
            role={
              toast.variant === "error"
                ? "alert"
                : "status"
            }
          >

            <span>{toast.message}</span>

            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="알림 닫기"
            >
              ×
            </button>

          </div>

        ))}

      </div>

    </ToastContext.Provider>
  );
}

// ============================================================
// 알림 사용 Hook
// ============================================================

export function useToast(): ToastContextValue {

  const context = useContext(ToastContext);

  if (!context) {

    throw new Error(
      "ToastProvider 내부에서 useToast를 사용해야 합니다."
    );
  }

  return context;
}

// ============================================================
// 공통 페이지네이션
// ============================================================

export interface PaginationProps {

  page: number;

  pageSize: number;

  total: number;

  onPageChange: (page: number) => void;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange
}: PaginationProps) {

  const safePageSize = Math.max(1, pageSize);

  const totalPages = Math.max(
    1,
    Math.ceil(total / safePageSize)
  );

  const currentPage = Math.min(
    Math.max(1, page),
    totalPages
  );

  return (
    <nav
      className="sk-pagination"
      aria-label="페이지 이동"
    >

      <Button
        variant="secondary"
        disabled={currentPage <= 1}
        onClick={() => {
          onPageChange(currentPage - 1);
        }}
      >
        이전
      </Button>

      <span aria-live="polite">
        {currentPage} / {totalPages}
      </span>

      <Button
        variant="secondary"
        disabled={currentPage >= totalPages}
        onClick={() => {
          onPageChange(currentPage + 1);
        }}
      >
        다음
      </Button>

    </nav>
  );
}


export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className="ss-notice" role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"}>{children}</div>;
}
export function Skeleton({ label = "불러오는 중" }: { label?: string }) { return <div className="ss-skeleton" role="status" aria-label={label}><span className="ss-sr-only">{label}</span></div>; }
export function Card({ title, children }: { title: string; children: ReactNode }) { return <section className="ss-card"><h2>{title}</h2>{children}</section>; }
export function DataTable<T>({ caption, rows, columns, rowKey }: { caption: string; rows: T[]; columns: { key: string; title: string; render: (row: T) => ReactNode }[]; rowKey: (row: T) => string }) {
  return <div className="ss-table"><table><caption>{caption}</caption><thead><tr>{columns.map(column => <th key={column.key} scope="col">{column.title}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={rowKey(row)}>{columns.map(column => <td key={column.key}>{column.render(row)}</td>)}</tr>)}</tbody></table>{rows.length === 0 && <EmptyState title="표시할 데이터가 없습니다." />}</div>;
}
