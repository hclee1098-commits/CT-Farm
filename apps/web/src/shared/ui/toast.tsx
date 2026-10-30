// filepath: apps/web/src/shared/ui/toast.tsx - 성공 오류 안내 메시지를 표시하는 공통 알림 시스템
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from "react";

import type {
  ReactNode
} from "react";

// ============================================================
// 알림 타입
// ============================================================

export type ToastType =
  | "success"
  | "error"
  | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

type Notify = (
  message: string,
  type?: ToastType
) => void;

const ToastContext = createContext<Notify | null>(null);

// ============================================================
// 알림 제공자
// ============================================================

export function ToastProvider({
  children
}: {
  children: ReactNode;
}) {

  const [items, setItems] = useState<ToastItem[]>([]);

  const nextId = useRef(0);

  const timers = useRef<
    ReturnType<typeof setTimeout>[]
  >([]);

  useEffect(() => {

    return () => {

      for (const timer of timers.current) {
        clearTimeout(timer);
      }

    };

  }, []);

  const notify = useCallback<Notify>(
    (message, type = "info") => {

      const id = ++nextId.current;

      setItems((current) => [
        ...current.slice(-3),
        {
          id,
          type,
          message
        }
      ]);

      const timer = setTimeout(() => {

        setItems((current) =>
          current.filter((item) => item.id !== id)
        );

      }, 4000);

      timers.current.push(timer);
    },
    []
  );

  return (
    <ToastContext.Provider value={notify}>

      {children}

      <div
        aria-live="polite"
        aria-atomic="false"
        style={{
          position: "fixed",
          top: 20,
          right: 20,
          zIndex: 9999,
          display: "grid",
          gap: 10,
          width: "min(360px, calc(100vw - 40px))"
        }}
      >

        {items.map((item) => {

          const color =
            item.type === "success"
              ? "#166534"
              : item.type === "error"
                ? "#991b1b"
                : "#1e40af";

          return (
            <div
              key={item.id}
              role={
                item.type === "error"
                  ? "alert"
                  : "status"
              }
              style={{
                padding: "14px 18px",
                borderRadius: 10,
                color: "#ffffff",
                backgroundColor: color,
                boxShadow: "0 8px 24px #0002",
                overflowWrap: "anywhere"
              }}
            >
              {item.message}
            </div>
          );

        })}

      </div>

    </ToastContext.Provider>
  );
}

// ============================================================
// 알림 호출 Hook
// ============================================================

export function useToast(): Notify {

  const context = useContext(ToastContext);

  if (!context) {
    throw new Error(
      "ToastProvider 내부에서 useToast를 사용해야 합니다."
    );
  }

  return context;
}

