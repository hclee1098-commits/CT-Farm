// filepath: apps/web/src/shared/ui/async-state.tsx - 비동기 화면의 로딩 오류 빈 데이터 상태 표시
"use client";

// ============================================================
// 공통 로딩 표시
// ============================================================

export function LoadingState({
  message = "데이터를 불러오는 중입니다."
}: {
  message?: string;
}) {

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: 30,
        textAlign: "center",
        color: "#4b5563"
      }}
    >
      <span aria-hidden="true">⏳ </span>
      {message}
    </div>
  );
}

// ============================================================
// 빈 데이터 표시
// ============================================================

export function EmptyState({
  message = "표시할 데이터가 없습니다."
}: {
  message?: string;
}) {

  return (
    <div
      style={{
        padding: 30,
        textAlign: "center",
        color: "#6b7280",
        border: "1px dashed #d1d5db",
        borderRadius: 12
      }}
    >
      {message}
    </div>
  );
}

// ============================================================
// 오류 표시
// ============================================================

export function ErrorState({
  message = "문제가 발생했습니다.",
  onRetry
}: {
  message?: string;
  onRetry?: () => void;
}) {

  return (
    <div
      role="alert"
      style={{
        padding: 24,
        border: "1px solid #fecaca",
        borderRadius: 12,
        background: "#fef2f2",
        color: "#991b1b"
      }}
    >

      <p>{message}</p>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #fca5a5",
            background: "#ffffff",
            color: "#991b1b",
            cursor: "pointer"
          }}
        >
          다시 시도
        </button>
      )}

    </div>
  );
}

