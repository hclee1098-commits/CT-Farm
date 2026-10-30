// filepath: apps/web/src/shared/auth/auth-guard.tsx - 인증되지 않은 사용자의 보호 페이지 접근 제한
"use client";

import Link from "next/link";

import type {
  ReactNode
} from "react";

import {
  useAuth
} from "./auth-provider";

// ============================================================
// 보호 페이지
// ============================================================

export function AuthGuard({
  children
}: {
  children: ReactNode;
}) {

  const {
    status
  } = useAuth();

  // ==========================================================
  // 인증 확인 중
  // ==========================================================

  if (status === "checking") {

    return (
      <main
        style={{
          padding: 32,
          maxWidth: 900,
          margin: "0 auto"
        }}
      >
        <h1>인증 상태 확인</h1>

        <p role="status">
          로그인 상태를 확인하고 있습니다.
        </p>
      </main>
    );
  }

  // ==========================================================
  // 비로그인 사용자
  // ==========================================================

  if (status === "guest") {

    return (
      <main
        style={{
          padding: 32,
          maxWidth: 900,
          margin: "0 auto"
        }}
      >
        <h1>로그인이 필요합니다.</h1>

        <p>
          이 페이지는 인증된 사용자만
          이용할 수 있습니다.
        </p>

        <Link
          href="/starter/toolkit/part9"
        >
          로그인 화면으로 이동
        </Link>
      </main>
    );
  }

  // ==========================================================
  // 인증된 사용자
  // ==========================================================

  return <>{children}</>;
}


