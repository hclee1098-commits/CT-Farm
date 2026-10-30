// filepath: apps/web/src/app/starter/toolkit/part9/page.tsx - 로그인 로그아웃 인증 갱신 및 보호 페이지 진입 화면
"use client";

import {
  useState
} from "react";

import type {
  FormEvent
} from "react";

import Link from "next/link";

import {
  useAuth
} from "../../../../shared/auth/auth-provider";

import {
  useToast
} from "../../../../shared/ui/toast";

// ============================================================
// 9부 인증 관리 화면
// ============================================================

export default function Part9Page() {

  const {
    status,
    user,
    login,
    logout,
    refresh
  } = useAuth();

  const notify = useToast();

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);

  // ==========================================================
  // 로그인
  // ==========================================================

  const handleLogin = async (
    event: FormEvent<HTMLFormElement>
  ) => {

    event.preventDefault();

    if (busy) {
      return;
    }

    setBusy(true);

    try {

      await login(
        email.trim(),
        password
      );

      setPassword("");

      notify(
        "로그인에 성공했습니다.",
        "success"
      );

    }
    catch (error) {

      notify(
        error instanceof Error
          ? error.message
          : "로그인에 실패했습니다.",
        "error"
      );

    }
    finally {

      setBusy(false);
    }
  };

  // ==========================================================
  // 로그아웃
  // ==========================================================

  const handleLogout = async () => {

    if (busy) {
      return;
    }

    const confirmed = window.confirm(
      "로그아웃하시겠습니까?"
    );

    if (!confirmed) {
      return;
    }

    setBusy(true);

    try {

      await logout();

      notify(
        "로그아웃되었습니다.",
        "success"
      );

    }
    catch (error) {

      notify(
        error instanceof Error
          ? error.message
          : "로그아웃에 실패했습니다.",
        "error"
      );

    }
    finally {

      setBusy(false);
    }
  };

  // ==========================================================
  // 인증 갱신
  // ==========================================================

  const handleRefresh = async () => {

    if (busy) {
      return;
    }

    setBusy(true);

    try {

      const result = await refresh();

      if (result) {

        notify(
          "인증 상태가 갱신되었습니다.",
          "success"
        );

      }
      else {

        notify(
          "유효한 로그인 세션이 없습니다.",
          "error"
        );
      }

    }
    catch {

      notify(
        "인증 갱신에 실패했습니다.",
        "error"
      );

    }
    finally {

      setBusy(false);
    }
  };

  // ==========================================================
  // 화면
  // ==========================================================

  return (
    <main
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: 32
      }}
    >

      <h1>
        9부 - 공통 인증 관리
      </h1>

      <p>
        JWT 인증, 자동 갱신, 접근 권한,
        브라우저 탭 동기화 기능을 관리합니다.
      </p>

      <hr />

      <section
        style={{
          marginTop: 24,
          marginBottom: 24
        }}
      >

        <h2>현재 인증 상태</h2>

        <p role="status">

          {status === "checking"
            ? "인증 상태 확인 중"
            : status === "authenticated"
              ? "로그인 상태"
              : "로그아웃 상태"}

        </p>

        {user && (
          <div>

            <p>
              회원 이름: {user.name}
            </p>

            <p>
              이메일: {user.email}
            </p>

          </div>
        )}

      </section>

      <hr />

      {status === "guest" && (

        <section
          style={{
            marginTop: 24
          }}
        >

          <h2>로그인</h2>

          <form
            onSubmit={handleLogin}
            style={{
              display: "grid",
              gap: 12,
              maxWidth: 420
            }}
          >

            <label htmlFor="part9-email">
              이메일
            </label>

            <input
              id="part9-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              style={{
                padding: 12
              }}
            />

            <label htmlFor="part9-password">
              비밀번호
            </label>

            <input
              id="part9-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              style={{
                padding: 12
              }}
            />

            <button
              type="submit"
              disabled={busy}
              style={{
                padding: 12,
                cursor: "pointer"
              }}
            >
              {busy ? "처리 중..." : "로그인"}
            </button>

          </form>

          <p>
            계정이 없다면{" "}
            <Link href="/starter/register">
              회원가입
            </Link>
          </p>

        </section>
      )}

      {status === "authenticated" && (

        <section
          style={{
            marginTop: 24
          }}
        >

          <h2>인증 관리</h2>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12
            }}
          >

            <button
              type="button"
              onClick={handleRefresh}
              disabled={busy}
              style={{
                padding: 12
              }}
            >
              인증 갱신
            </button>

            <button
              type="button"
              onClick={handleLogout}
              disabled={busy}
              style={{
                padding: 12
              }}
            >
              로그아웃
            </button>

          </div>

          <div
            style={{
              marginTop: 24
            }}
          >

            <h3>보호된 페이지</h3>

            <Link
              href="/starter/toolkit/part9/private"
            >
              인증된 게시글 조회 페이지
            </Link>

          </div>

        </section>
      )}

      <hr
        style={{
          marginTop: 32
        }}
      />

      <section>

        <h2>적용된 보안 정책</h2>

        <ul>

          <li>
            Access Token 메모리 저장
          </li>

          <li>
            Refresh 요청 중복 방지
          </li>

          <li>
            JWT 자동 첨부
          </li>

          <li>
            인증 만료 감지
          </li>

          <li>
            GET 요청의 제한적 자동 재시도
          </li>

          <li>
            브라우저 탭 간 로그아웃 동기화
          </li>

          <li>
            인증되지 않은 사용자의 페이지 접근 제한
          </li>

        </ul>

      </section>

      <p
        style={{
          marginTop: 32
        }}
      >

        <Link href="/starter/toolkit">
          공통 기능 화면으로 돌아가기
        </Link>

      </p>

    </main>
  );
}


