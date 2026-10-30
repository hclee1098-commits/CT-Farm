// filepath: apps/web/src/app/starter/toolkit/page.tsx - 공통 API 통신과 UI 컴포넌트 확인 화면
"use client";

import {
  useCallback,
  useEffect,
  useState
} from "react";

import {
  apiClient,
  ApiClientError
} from "../../../shared/api/client";

import {
  Button,
  TextField,
  Loading,
  EmptyState,
  Modal,
  ToastProvider,
  useToast,
  Pagination
} from "../../../shared/ui";

import "../../../shared/ui/ui.css";

// ============================================================
// 헬스체크 응답 타입
// ============================================================

interface HealthData {
  status: string;
}

interface ReadyData {
  status: string;
  database: string;
  redis: string;
}

// ============================================================
// 페이지네이션 예제 데이터
// ============================================================

const demoItems = Array.from(
  { length: 23 },
  (_, index) => ({
    id: index + 1,
    title: `공통 목록 예제 ${index + 1}`
  })
);

// ============================================================
// 공통 기능 화면
// ============================================================

function ToolkitContent() {

  const { notify } = useToast();

  const [name, setName] = useState("");

  const [modalOpen, setModalOpen] = useState(false);

  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);

  const [health, setHealth] = useState<HealthData | null>(
    null
  );

  const [ready, setReady] = useState<ReadyData | null>(
    null
  );

  const [error, setError] = useState("");

  // ==========================================================
  // API 서버 상태 조회
  // ==========================================================

  const loadHealth = useCallback(async (
    signal?: AbortSignal
  ) => {

    setLoading(true);
    setError("");

    try {

      const [healthResponse, readyResponse] =
        await Promise.all([

          apiClient.request<HealthData>({
            path: "/health",
            scope: "root",
            auth: "none",
            signal,
            timeoutMs: 8000
          }),

          apiClient.request<ReadyData>({
            path: "/health/ready",
            scope: "root",
            auth: "none",
            signal,
            timeoutMs: 8000
          })

        ]);

      if (signal?.aborted) {
        return;
      }

      setHealth(healthResponse.data);

      setReady(readyResponse.data);

    } catch (caught) {

      if (signal?.aborted) {
        return;
      }

      setHealth(null);
      setReady(null);

      if (caught instanceof ApiClientError) {

        setError(
          `${caught.message} (${caught.errorCode})`
        );

      } else {

        setError(
          "서버 상태를 확인하지 못했습니다."
        );
      }

    } finally {

      if (!signal?.aborted) {
        setLoading(false);
      }
    }

  }, []);

  // 페이지 최초 진입 시 서버 상태를 조회합니다.
  useEffect(() => {

    const controller = new AbortController();

    void loadHealth(controller.signal);

    return () => {
      controller.abort();
    };

  }, [loadHealth]);

  // ==========================================================
  // 페이지네이션
  // ==========================================================

  const pageSize = 5;

  const visibleItems = demoItems.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  // ==========================================================
  // 알림 예제
  // ==========================================================

  function showGreeting() {

    const trimmedName = name.trim();

    if (!trimmedName) {

      notify(
        "이름을 입력해 주세요.",
        "error"
      );

      return;
    }

    notify(
      `${trimmedName}님, 공통 알림 기능이 정상적으로 동작합니다.`,
      "success"
    );
  }

  // ==========================================================
  // 화면
  // ==========================================================

  return (
    <main className="sk-toolkit">

      <h1>
        풀스택 공통 기능 관리
      </h1>

      <p className="sk-toolkit-description">
        7부에서 추가한 공통 API 및 UI 기능을 확인하는 화면입니다.
        기존 회원 정보나 게시글 데이터는 변경하지 않습니다.
      </p>

      {/* =====================================================
          API 서버 상태
          ===================================================== */}

      <section className="sk-card">

        <h2>API 서버 연결 상태</h2>

        {loading ? (

          <Loading message="서버 상태를 확인하고 있습니다." />

        ) : error ? (

          <div
            className="sk-status"
            role="alert"
          >
            {error}
          </div>

        ) : (

          <div className="sk-status">

            <div>
              API 서버: {health?.status ?? "확인 불가"}
            </div>

            <div>
              데이터베이스: {ready?.database ?? "확인 불가"}
            </div>

            <div>
              Redis: {ready?.redis ?? "확인 불가"}
            </div>

          </div>

        )}

        <div
          className="sk-row"
          style={{ marginTop: 16 }}
        >

          <Button
            loading={loading}
            onClick={() => {
              void loadHealth();
            }}
          >
            서버 상태 새로고침
          </Button>

        </div>

      </section>

      {/* =====================================================
          버튼
          ===================================================== */}

      <section className="sk-card">

        <h2>공통 버튼</h2>

        <div className="sk-row">

          <Button
            onClick={() => {
              notify(
                "기본 버튼을 눌렀습니다.",
                "success"
              );
            }}
          >
            기본 버튼
          </Button>

          <Button
            variant="secondary"
            onClick={() => {
              notify(
                "보조 버튼을 눌렀습니다.",
                "info"
              );
            }}
          >
            보조 버튼
          </Button>

          <Button
            variant="danger"
            onClick={() => {
              notify(
                "위험 작업 버튼 예제입니다.",
                "error"
              );
            }}
          >
            위험 버튼
          </Button>

          <Button disabled>
            비활성 버튼
          </Button>

        </div>

      </section>

      {/* =====================================================
          입력창
          ===================================================== */}

      <section className="sk-card">

        <h2>공통 입력창 및 알림</h2>

        <div style={{ maxWidth: 420 }}>

          <TextField
            label="이름"
            placeholder="이름을 입력해 주세요."
            value={name}
            maxLength={60}
            onChange={(event) => {
              setName(event.target.value);
            }}
            hint="입력한 값은 서버에 저장되지 않습니다."
          />

          <div style={{ marginTop: 16 }}>

            <Button onClick={showGreeting}>
              알림 표시
            </Button>

          </div>

        </div>

      </section>

      {/* =====================================================
          모달
          ===================================================== */}

      <section className="sk-card">

        <h2>공통 모달</h2>

        <Button
          onClick={() => {
            setModalOpen(true);
          }}
        >
          모달 열기
        </Button>

        <Modal
          open={modalOpen}
          title="공통 모달"
          onClose={() => {
            setModalOpen(false);
          }}
        >

          <p>
            이 모달은 다른 프로젝트에서도 재사용할 수 있습니다.
          </p>

          <p>
            ESC 키 또는 닫기 버튼으로 종료할 수 있습니다.
          </p>

          <Button
            onClick={() => {
              setModalOpen(false);
            }}
          >
            확인
          </Button>

        </Modal>

      </section>

      {/* =====================================================
          페이지네이션
          ===================================================== */}

      <section className="sk-card">

        <h2>공통 페이지네이션</h2>

        <ul className="sk-demo-list">

          {visibleItems.map((item) => (

            <li key={item.id}>
              {item.title}
            </li>

          ))}

        </ul>

        <Pagination
          page={page}
          pageSize={pageSize}
          total={demoItems.length}
          onPageChange={setPage}
        />

      </section>

      {/* =====================================================
          빈 데이터
          ===================================================== */}

      <section className="sk-card">

        <h2>빈 데이터 안내</h2>

        <EmptyState
          title="등록된 데이터가 없습니다."
          description="데이터가 없을 때 공통으로 표시하는 화면입니다."
        />

      </section>

    </main>
  );
}

// ============================================================
// 알림 Provider 연결
// ============================================================

export default function ToolkitPage() {

  return (
    <ToastProvider>
      <ToolkitContent />
    </ToastProvider>
  );
}

