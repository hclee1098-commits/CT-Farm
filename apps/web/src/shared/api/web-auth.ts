// filepath: apps/web/src/shared/api/web-auth.ts - 회원가입, 로그인, 로그아웃과 사용자 조회를 위한 웹 인증 서비스
import {
  apiClient,
  tokenMemory
} from "./client";

// ============================================================
// 인증 요청 타입
// ============================================================

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

// ============================================================
// 회원 정보 타입
// ============================================================

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// 인증 응답 타입
// ============================================================

interface AuthData {
  user: PublicUser;
  accessToken: string;
}

// ============================================================
// 웹 인증 서비스
// ============================================================

export const webAuth = {

  // 회원가입
  async register(
    input: RegisterInput
  ): Promise<PublicUser> {

    const response = await apiClient.request<AuthData>({
      path: "/auth/web/register",
      method: "POST",
      body: input,
      auth: "none"
    });

    tokenMemory.set(
      response.data.accessToken
    );

    return response.data.user;
  },

  // 로그인
  async login(
    input: LoginInput
  ): Promise<PublicUser> {

    const response = await apiClient.request<AuthData>({
      path: "/auth/web/login",
      method: "POST",
      body: input,
      auth: "none"
    });

    tokenMemory.set(
      response.data.accessToken
    );

    return response.data.user;
  },

  // 내 정보 조회
  async me(): Promise<PublicUser> {

    const response = await apiClient.request<PublicUser>({
      path: "/auth/me",
      method: "GET",
      auth: "required"
    });

    return response.data;
  },

  // 현재 브라우저 로그아웃
  async logout(): Promise<void> {

    try {

      await apiClient.request({
        path: "/auth/web/logout",
        method: "POST",
        auth: "none"
      });

    } finally {

      // 서버 요청 실패 여부와 관계없이
      // 브라우저 메모리의 Access Token을 제거합니다.
      tokenMemory.clear();
    }
  },

  // 모든 기기 로그아웃
  async logoutAll(): Promise<void> {

    try {

      await apiClient.request({
        path: "/auth/logout-all",
        method: "POST",
        auth: "required"
      });

    } finally {

      tokenMemory.clear();
    }
  }
};

