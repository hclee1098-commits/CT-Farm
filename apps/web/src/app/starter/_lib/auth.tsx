// filepath: apps/web/src/app/starter/_lib/auth.tsx - 기존 Starter 화면과 통합 인증 Provider의 호환성을 유지하는 연결 모듈
"use client";

// ============================================================
// 기존 Starter 인증 인터페이스 호환
// ============================================================

// 기존 로그인, 회원가입, 게시글, 파일 관리 화면은
// 이 모듈의 useAuth를 그대로 사용할 수 있습니다.
//
// 실제 인증 상태와 토큰 관리는
// shared/auth 모듈에서 단일화하여 처리합니다.

export {
  AuthProvider,
  useAuth
} from "../../../shared/auth/auth-provider";

