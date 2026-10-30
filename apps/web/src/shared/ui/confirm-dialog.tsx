// filepath: apps/web/src/shared/ui/confirm-dialog.tsx - 중요한 작업 전 사용자 확인을 받는 공통 대화상자
"use client";

import {
  useEffect,
  useRef
} from "react";

// ============================================================
// 확인창 속성
// ============================================================

interface ConfirmDialogProps {

  open: boolean;

  title: string;

  description: string;

  confirmText?: string;

  cancelText?: string;

  danger?: boolean;

  onConfirm: () => void;

  onCancel: () => void;
}

// ============================================================
// 공통 확인창
// ============================================================

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "확인",
  cancelText = "취소",
  danger = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {

  const dialogRef = useRef<HTMLDialogElement>(null);

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

  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 24,
        width: "min(420px, calc(100vw - 40px))",
        maxWidth: "100%",
        color: "#111827",
        background: "#ffffff",
        boxShadow: "0 20px 60px #0003"
      }}
    >

      <h2
        id="confirm-dialog-title"
        style={{
          marginTop: 0,
          fontSize: 20
        }}
      >
        {title}
      </h2>

      <p
        id="confirm-dialog-description"
        style={{
          lineHeight: 1.6,
          color: "#4b5563"
        }}
      >
        {description}
      </p>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 10,
          marginTop: 24
        }}
      >

        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "10px 16px",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            background: "#ffffff",
            color: "#111827",
            cursor: "pointer"
          }}
        >
          {cancelText}
        </button>

        <button
          type="button"
          onClick={onConfirm}
          style={{
            padding: "10px 16px",
            border: 0,
            borderRadius: 8,
            background: danger
              ? "#dc2626"
              : "#2563eb",
            color: "#ffffff",
            cursor: "pointer"
          }}
        >
          {confirmText}
        </button>

      </div>

    </dialog>
  );
}

