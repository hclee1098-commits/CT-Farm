// filepath: apps/web/src/app/starter/toolkit/part8/page.tsx - 8부 공통 알림 확인창 파일 검증 및 상태 UI 확인 화면
"use client";

import {
  useState
} from "react";

import {
  ToastProvider,
  useToast
} from "../../../../shared/ui/toast";

import {
  ConfirmDialog
} from "../../../../shared/ui/confirm-dialog";

import {
  LoadingState,
  EmptyState,
  ErrorState
} from "../../../../shared/ui/async-state";

import {
  ErrorBoundary
} from "../../../../shared/ui/error-boundary";

import {
  validateUploadFile
} from "../../../../shared/security/file-preflight";

// ============================================================
// 공통 기능 화면
// ============================================================

function ToolkitContent() {

  const toast = useToast();

  const [confirmOpen, setConfirmOpen] = useState(false);

  const [showLoading, setShowLoading] = useState(false);

  const [showError, setShowError] = useState(false);

  return (
    <main
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: "40px 20px",
        fontFamily: "Arial, sans-serif"
      }}
    >

      <h1>8부 프론트엔드 공통 기능</h1>

      <p style={{ color: "#6b7280" }}>
        공통 UI와 파일 사전 검증 기능을 확인하는 화면입니다.
      </p>

      <section style={sectionStyle}>

        <h2>1. 공통 알림 시스템</h2>

        <div style={rowStyle}>

          <button
            style={buttonStyle}
            onClick={() =>
              toast("작업이 완료되었습니다.", "success")
            }
          >
            성공 알림
          </button>

          <button
            style={buttonStyle}
            onClick={() =>
              toast("작업 중 오류가 발생했습니다.", "error")
            }
          >
            오류 알림
          </button>

          <button
            style={buttonStyle}
            onClick={() =>
              toast("안내 메시지입니다.", "info")
            }
          >
            안내 알림
          </button>

        </div>

      </section>

      <section style={sectionStyle}>

        <h2>2. 공통 확인창</h2>

        <button
          style={buttonStyle}
          onClick={() => setConfirmOpen(true)}
        >
          확인창 열기
        </button>

        <ConfirmDialog
          open={confirmOpen}
          title="작업 확인"
          description="정말 이 작업을 진행하시겠습니까?"
          confirmText="진행"
          cancelText="취소"
          danger
          onConfirm={() => {

            setConfirmOpen(false);

            toast(
              "확인 버튼을 눌렀습니다.",
              "success"
            );

          }}
          onCancel={() => setConfirmOpen(false)}
        />

      </section>

      <section style={sectionStyle}>

        <h2>3. 로딩 상태</h2>

        <button
          style={buttonStyle}
          onClick={() =>
            setShowLoading((value) => !value)
          }
        >
          로딩 표시 전환
        </button>

        {showLoading && <LoadingState />}

      </section>

      <section style={sectionStyle}>

        <h2>4. 빈 데이터 상태</h2>

        <EmptyState message="등록된 게시글이 없습니다." />

      </section>

      <section style={sectionStyle}>

        <h2>5. 오류 상태</h2>

        <button
          style={buttonStyle}
          onClick={() => setShowError(true)}
        >
          오류 화면 표시
        </button>

        {showError && (
          <ErrorState
            message="데이터를 불러오지 못했습니다."
            onRetry={() => {

              setShowError(false);

              toast(
                "다시 시도했습니다.",
                "info"
              );

            }}
          />
        )}

      </section>

      <section style={sectionStyle}>

        <h2>6. 파일 업로드 사전 검증</h2>

        <p style={{ color: "#6b7280" }}>
          PNG, JPG, WEBP, PDF 파일을 최대 5MB까지
          사전 검증합니다.
        </p>

        <input
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.pdf"
          onChange={(event) => {

            const file =
              event.currentTarget.files?.[0];

            const result = validateUploadFile(file);

            toast(
              result.message,
              result.valid ? "success" : "error"
            );

            event.currentTarget.value = "";
          }}
        />

      </section>

      <section style={sectionStyle}>

        <h2>7. 화면 오류 격리</h2>

        <p>
          Error Boundary가 하위 컴포넌트의 렌더링 오류를
          격리할 수 있도록 구성되어 있습니다.
        </p>

        <ErrorBoundary>
          <p>정상적으로 렌더링된 컴포넌트입니다.</p>
        </ErrorBoundary>

      </section>

      <section style={sectionStyle}>

        <h2>8. API 통신 공통 기능</h2>

        <p>
          요청 타임아웃, 취소 처리, 오류 응답 표준화,
          인증 헤더 전달 기능이 추가되었습니다.
        </p>

        <p style={{ color: "#6b7280" }}>
          기존 인증 클라이언트와의 통합은 별도로 진행합니다.
        </p>

      </section>

    </main>
  );
}

// ============================================================
// 공통 스타일
// ============================================================

const sectionStyle = {
  padding: 24,
  marginTop: 20,
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  backgroundColor: "#ffffff",
  color: "#111827"
};

const rowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 10
};

const buttonStyle = {
  padding: "10px 16px",
  backgroundColor: "#2563eb",
  color: "#ffffff",
  border: "none",
  borderRadius: 8,
  cursor: "pointer"
};

// ============================================================
// 페이지
// ============================================================

export default function Part8Page() {

  return (
    <ToastProvider>
      <ToolkitContent />
    </ToastProvider>
  );
}

