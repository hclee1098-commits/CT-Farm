// filepath: apps/web/src/shared/api/client.ts - 웹과 모바일 연동을 고려한 공통 HTTP 클라이언트

import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  expireSession,
  refreshSession
} from "../auth/auth-client";
// ============================================================
// API 기본 설정
// ============================================================

// 환경 변수에는 API 서버의 주소를 지정합니다.
// 기존 설정 이름과의 호환성을 위해 두 가지를 지원합니다.
import { API_ORIGIN, API_BASE_URL } from "./config";
export { API_BASE_URL } from "./config";

// ============================================================
// 공통 응답 타입
// ============================================================

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message: string;
}

export interface ApiFailure {
  success: false;
  errorCode: string;
  message: string;
}

// ============================================================
// 공통 API 오류
// ============================================================

export class ApiClientError extends Error {

  constructor(
    public readonly status: number,
    public readonly errorCode: string,
    message: string
  ) {
    super(message);

    this.name = "ApiClientError";
  }
}

// ============================================================
// Access Token 메모리 저장소
// ============================================================

// Access Token을 localStorage에 저장하지 않습니다.
// 새로고침하면 메모리의 토큰은 사라집니다.
// 웹에서는 HttpOnly Refresh Cookie로 복구할 수 있습니다.

export const tokenMemory = {

  get(): string | null {
    return getAccessToken();
  },

  set(token: string): void {
    setAccessToken(token);
  },

  clear(): void {
    clearAccessToken();
  }
};

// ============================================================
// 요청 타입
// ============================================================

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE";

export type AuthMode =
  | "none"
  | "optional"
  | "required";

type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined;

export interface ApiRequestOptions {

  path: string;

  method?: HttpMethod;

  body?: unknown;

  query?: Record<string, QueryValue>;

  signal?: AbortSignal;

  timeoutMs?: number;

  auth?: AuthMode;

  // 일반 API는 /api/v1을 사용합니다.
  // health API처럼 루트 경로가 필요하면 root를 사용합니다.
  scope?: "api" | "root";
}

// ============================================================
// 클라이언트 확장 옵션
// ============================================================

// 모바일 앱에서는 아래 콜백을 사용하여
// Expo SecureStore 등의 보안 저장소와 연결할 수 있습니다.

export interface ApiClientOptions {

  getAccessToken?: () => string | null;

  refreshAccessToken?: () => Promise<string | null>;

  onAccessToken?: (token: string | null) => void;

  onUnauthorized?: () => void;

  credentials?: RequestCredentials;
}

// ============================================================
// 안전한 URL 생성
// ============================================================

function createUrl(
  options: ApiRequestOptions
): string {

  const path = options.path;

  // 외부 URL로 요청이 전환되는 것을 방지합니다.
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    path.includes("?") ||
    path.includes("#") ||
    /[\u0000-\u0020\u007f]/.test(path)
  ) {
    throw new ApiClientError(
      0,
      "INVALID_API_PATH",
      "API 요청 경로가 올바르지 않습니다."
    );
  }

  const base =
    options.scope === "root"
      ? API_ORIGIN
      : API_BASE_URL;

  const url = new URL(base + path);

  if (/[\u0000-\u0020\u007f]/.test(path) ||
      url.origin !== API_ORIGIN ||
      (options.scope !== "root" && !url.pathname.startsWith("/api/v1/"))) {
    throw new ApiClientError(0, "INVALID_API_PATH", "허용되지 않은 API 경로입니다.");
  }

  // 쿼리 문자열은 URLSearchParams로 안전하게 구성합니다.
  if (options.query) {

    for (const [key, value] of Object.entries(options.query)) {

      if (value === undefined || value === null) {
        continue;
      }

      url.searchParams.set(
        key,
        String(value)
      );
    }
  }

  return url.toString();
}

// ============================================================
// JSON 응답 검증
// ============================================================

function isRecord(
  value: unknown
): value is Record<string, unknown> {

  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

async function parseResponse<T>(
  response: Response
): Promise<ApiSuccess<T>> {

  const text = await response.text();

  let payload: unknown;

  try {

    payload = text
      ? JSON.parse(text)
      : null;

  } catch {

    throw new ApiClientError(
      response.status,
      "INVALID_RESPONSE",
      "서버 응답 형식이 올바르지 않습니다."
    );
  }

  if (!isRecord(payload)) {

    throw new ApiClientError(
      response.status,
      "INVALID_RESPONSE",
      "서버 응답 데이터가 올바르지 않습니다."
    );
  }

  if (
    !response.ok ||
    payload.success !== true
  ) {

    const errorCode =
      typeof payload.errorCode === "string"
        ? payload.errorCode
        : "API_REQUEST_FAILED";

    const message =
      typeof payload.message === "string"
        ? payload.message
        : "요청을 처리하지 못했습니다.";

    throw new ApiClientError(
      response.status,
      errorCode,
      message
    );
  }

  return payload as unknown as ApiSuccess<T>;
}

// ============================================================
// 웹 Refresh Token 갱신
// ============================================================

// Refresh Token은 JavaScript에서 직접 읽지 않습니다.
// 브라우저가 HttpOnly Cookie를 자동으로 전송합니다.

async function refreshWebSession(): Promise<string | null> {

  const result = await refreshSession();

  return result?.accessToken ?? null;
}

// ============================================================
// 공통 API 클라이언트 생성
// ============================================================

export function createApiClient(
  clientOptions: ApiClientOptions = {}
) {

  // 여러 요청이 동시에 401을 받더라도
  // Refresh Token 갱신 요청은 하나만 실행합니다.
  let refreshPromise: Promise<string | null> | null = null;

  const readToken =
    clientOptions.getAccessToken ??
    tokenMemory.get;

  const refreshToken =
    clientOptions.refreshAccessToken ??
    refreshWebSession;

  // ==========================================================
  // 실제 HTTP 요청
  // ==========================================================

  async function send(
    options: ApiRequestOptions,
    token: string | null
  ): Promise<Response> {

    const timeoutMs = options.timeoutMs ?? 10000;

    if (
      !Number.isFinite(timeoutMs) ||
      timeoutMs < 100 ||
      timeoutMs > 120000
    ) {
      throw new ApiClientError(
        0,
        "INVALID_TIMEOUT",
        "요청 제한 시간이 올바르지 않습니다."
      );
    }

    const controller = new AbortController();

    let timedOut = false;

    // 외부에서 요청 취소를 전달할 수 있습니다.
    const abortFromParent = () => {
      controller.abort();
    };

    if (options.signal?.aborted) {
      controller.abort();
    } else {
      options.signal?.addEventListener(
        "abort",
        abortFromParent,
        { once: true }
      );
    }

    const timeoutId = setTimeout(() => {

      timedOut = true;

      controller.abort();

    }, timeoutMs);

    const headers: Record<string, string> = {
      Accept: "application/json"
    };

    if (
      token &&
      options.auth !== "none"
    ) {
      headers.Authorization = `Bearer ${token}`;
    }

    let body: string | undefined;

    if (options.body !== undefined) {

      body = JSON.stringify(options.body);

      headers["Content-Type"] =
        "application/json; charset=utf-8";
    }

    try {

      const requestUrl = createUrl(options);
      return await fetch(
        requestUrl,
        {
          method: options.method ?? "GET",

          headers,

          body,

          credentials:
            clientOptions.credentials ?? "include",

          signal: controller.signal,

          cache: "no-store",

          redirect: "error"
        }
      );

    } catch (error) {

      if (error instanceof ApiClientError) throw error;

      if (options.signal?.aborted) {

        throw new ApiClientError(
          0,
          "REQUEST_ABORTED",
          "요청이 취소되었습니다."
        );
      }

      if (timedOut) {

        throw new ApiClientError(
          0,
          "REQUEST_TIMEOUT",
          "서버 응답 시간이 초과되었습니다."
        );
      }

      throw new ApiClientError(
        0,
        "NETWORK_ERROR",
        "서버에 연결할 수 없습니다."
      );

    } finally {

      clearTimeout(timeoutId);

      options.signal?.removeEventListener(
        "abort",
        abortFromParent
      );
    }
  }

  // ==========================================================
  // Refresh Token 동시 갱신 방지
  // ==========================================================

  async function getRefreshedToken(): Promise<string | null> {

    if (!refreshPromise) {

      refreshPromise = Promise.resolve()
        .then(() => refreshToken())
        .finally(() => {
          refreshPromise = null;
        });
    }

    return refreshPromise;
  }

  // ==========================================================
  // 외부에서 사용하는 API 요청 함수
  // ==========================================================

  async function request<T>(
    options: ApiRequestOptions
  ): Promise<ApiSuccess<T>> {

    const authMode = options.auth ?? "required";

    const initialToken =
      authMode === "none"
        ? null
        : readToken();

    let response = await send(
      options,
      initialToken
    );

    // 인증이 필요한 요청에서만 자동 갱신합니다.
    // 인증 API 자체에 대한 무한 갱신을 방지합니다.
    if (
      response.status === 401 &&
      authMode === "required" &&
      !options.path.startsWith("/auth/")
    ) {

      let renewedToken: string | null = null;

      try {

        renewedToken = await getRefreshedToken();

      } catch {

        renewedToken = null;
      }

      if (renewedToken) {

        if (!clientOptions.getAccessToken) {

          tokenMemory.set(renewedToken);
        }

        clientOptions.onAccessToken?.(
          renewedToken
        );

        // 조회 요청만 자동으로 한 번 재시도합니다.
        // 변경 요청은 중복 실행을 방지합니다.

        const method = options.method ?? "GET";

        if (method === "GET") {

          response = await send(
            options,
            renewedToken
          );

        }
        else {

          throw new ApiClientError(
            401,
            "RETRY_REQUIRED",
            "인증이 갱신되었습니다. 요청을 다시 실행해 주세요."
          );
        }

      } else {

        if (!clientOptions.getAccessToken) {

          expireSession();
        }

        clientOptions.onAccessToken?.(null);

        clientOptions.onUnauthorized?.();
      }
    }

    return parseResponse<T>(response);
  }

  return {
    request
  };
}

// ============================================================
// 웹 기본 API 클라이언트
// ============================================================

export const apiClient = createApiClient();

