// filepath: apps/web/src/shared/api/resilient-request.ts - 요청 타임아웃과 안전한 API 오류 처리
import {
  API_BASE_URL
} from "./client";

// ============================================================
// 공통 API 오류
// ============================================================

export class RequestError extends Error {

  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);

    this.name = "RequestError";
  }
}

// ============================================================
// API 요청 옵션
// ============================================================

export interface RequestOptions {

  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

  body?: unknown;

  accessToken?: string;

  timeoutMs?: number;

  signal?: AbortSignal;

  headers?: HeadersInit;
}

// ============================================================
// 오류 응답 타입
// ============================================================

interface ErrorResponse {
  success?: boolean;
  errorCode?: string;
  message?: string;
}

// ============================================================
// 안전한 오류 메시지
// ============================================================

function getSafeErrorMessage(
  status: number,
  response: ErrorResponse | null
): string {

  if (status >= 500) {
    return "서버에서 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  }

  if (status === 401) {
    return "로그인이 필요하거나 인증이 만료되었습니다.";
  }

  if (status === 403) {
    return "이 작업을 수행할 권한이 없습니다.";
  }

  if (status === 404) {
    return "요청한 정보를 찾을 수 없습니다.";
  }

  if (status === 429) {
    return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  }

  if (
    typeof response?.message === "string" &&
    response.message.length > 0 &&
    response.message.length <= 300
  ) {
    return response.message;
  }

  return "요청을 처리하지 못했습니다.";
}

// ============================================================
// API 공통 요청
// ============================================================

// 기존 인증 클라이언트를 변경하지 않는 독립 요청 함수입니다.
// Access Token은 호출자가 메모리에서 전달해야 합니다.
// localStorage나 sessionStorage에 토큰을 저장하지 않습니다.

export async function resilientRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {

  // 외부 주소로 인증 헤더가 전송되는 실수를 방지합니다.
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    /[\u0000-\u0020\u007f]/.test(path)
  ) {
    throw new RequestError(
      400,
      "INVALID_API_PATH",
      "API 경로가 올바르지 않습니다."
    );
  }

  const base = new URL(API_BASE_URL + "/");

  const url = new URL(path.slice(1), base);

  // API 기본 경로 밖으로 이동하는 요청을 차단합니다.
  if (
    url.origin !== base.origin ||
    !url.pathname.startsWith(base.pathname)
  ) {
    throw new RequestError(
      400,
      "INVALID_API_PATH",
      "허용되지 않은 API 경로입니다."
    );
  }

  const controller = new AbortController();

  const timeoutMs = options.timeoutMs ?? 15000;

  if (
    !Number.isFinite(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 120000
  ) {
    throw new RequestError(
      400,
      "INVALID_TIMEOUT",
      "요청 제한 시간이 올바르지 않습니다."
    );
  }

  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const abortFromCaller = () => {
    controller.abort();
  };

  if (options.signal?.aborted) {
    controller.abort();
  }

  options.signal?.addEventListener(
    "abort",
    abortFromCaller,
    { once: true }
  );

  try {

    const headers = new Headers(options.headers);

    headers.set("Accept", "application/json");

    if (options.accessToken) {
      headers.set(
        "Authorization",
        `Bearer ${options.accessToken}`
      );
    }

    let body: string | undefined;

    if (options.body !== undefined) {

      headers.set(
        "Content-Type",
        "application/json"
      );

      body = JSON.stringify(options.body);
    }

    const response = await fetch(
      url.toString(),
      {
        method: options.method ?? "GET",
        headers,
        body,
        credentials: "include",
        signal: controller.signal,
        cache: "no-store",
        redirect: "error"
      }
    );

    let result: unknown = null;

    const contentType =
      response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {

      try {
        result = await response.json();
      }
      catch {
        throw new RequestError(
          response.status,
          "INVALID_RESPONSE",
          "서버 응답을 처리할 수 없습니다."
        );
      }
    }

    if (!response.ok) {

      const errorResponse =
        result !== null &&
        typeof result === "object"
          ? result as ErrorResponse
          : null;

      throw new RequestError(
        response.status,
        errorResponse?.errorCode ?? "API_ERROR",
        getSafeErrorMessage(
          response.status,
          errorResponse
        )
      );
    }

    if (
      result === null ||
      typeof result !== "object" ||
      !("success" in result) ||
      result.success !== true ||
      !("data" in result)
    ) {
      throw new RequestError(
        response.status,
        "INVALID_RESPONSE",
        "서버 응답 형식이 올바르지 않습니다."
      );
    }

    return result.data as T;

  }
  catch (error) {

    if (error instanceof RequestError) {
      throw error;
    }

    if (timedOut) {
      throw new RequestError(
        0,
        "REQUEST_TIMEOUT",
        "서버 응답 시간이 초과되었습니다."
      );
    }

    if (controller.signal.aborted) {
      throw new RequestError(
        0,
        "REQUEST_CANCELLED",
        "요청이 취소되었습니다."
      );
    }

    throw new RequestError(
      0,
      "NETWORK_ERROR",
      "네트워크 연결을 확인해 주세요."
    );

  }
  finally {

    clearTimeout(timeout);

    options.signal?.removeEventListener(
      "abort",
      abortFromCaller
    );
  }
}

