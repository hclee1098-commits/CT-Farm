// filepath: apps/web/src/shared/auth/auth-client.ts - 웹 공통 인증 API와 단일 Access Token 저장소 및 안전한 세션 갱신
"use client";

// ============================================================
// API 주소
// ============================================================

import { API_ORIGIN, API_BASE_URL } from "../api/config";
export const AUTH_API_BASE_URL = API_BASE_URL;

// ============================================================
// 인증 사용자
// ============================================================

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role?: "USER" | "ADMIN";
  mfaEnabled?: boolean;
  notificationEmail?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResult {
  accessToken: string;
  user?: AuthUser;
}

// ============================================================
// API 응답 규격
// ============================================================

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  message?: string;
  errorCode?: string;
}

// ============================================================
// 인증 오류
// ============================================================

export class AuthRequestError extends Error {

  constructor(
    public readonly status: number,
    public readonly errorCode: string,
    message: string,
    public readonly retryAfterSeconds = 0
  ) {

    super(message);

    this.name = "AuthRequestError";
  }
}

// ============================================================
// 단일 Access Token 저장소
// ============================================================

// Access Token은 브라우저 메모리에만 보관합니다.
// localStorage 및 sessionStorage에는 저장하지 않습니다.

let accessToken: string | null = null;

// 오래된 비동기 요청이 로그아웃 이후
// 인증 상태를 복구하지 못하도록 세대를 관리합니다.

let sessionGeneration = 0;

// Refresh Token 회전 요청을 중복 실행하지 않습니다.

let refreshPromise: Promise<AuthResult | null> | null = null;
let refreshBlockedUntil = 0;

// ============================================================
// Access Token 조회
// ============================================================

export function getAccessToken(): string | null {

  return accessToken;
}

// ============================================================
// Access Token 저장
// ============================================================

export function setAccessToken(token: string): void {
  refreshBlockedUntil=0;

  sessionGeneration++;

  accessToken = token;
}

// ============================================================
// Access Token 삭제
// ============================================================

export function clearAccessToken(): void {

  sessionGeneration++;

  accessToken = null;
}

// ============================================================
// 인증 만료 이벤트
// ============================================================

export const AUTH_EXPIRED_EVENT = "starter:auth-expired";

export function expireSession(): void {

  clearAccessToken();

  if (typeof window !== "undefined") {

    window.dispatchEvent(
      new Event(AUTH_EXPIRED_EVENT)
    );
  }
}

// ============================================================
// API 응답 처리
// ============================================================

export async function readAuthApiResponse<T>(
  response: Response
): Promise<T> {

  const payload = await boundedJson(response) as ApiEnvelope<T> | null;

  if (
    !response.ok ||
    !payload ||
    payload.success !== true
  ) {

    throw new AuthRequestError(
      response.status,
      payload?.errorCode ?? "API_ERROR",
      response.status===429 ? `요청이 많습니다. ${retryDelay(response.headers.get('Retry-After'))}초 뒤 다시 눌러 주세요.` : payload?.message ??
        "서버 요청을 처리하지 못했습니다.",
      response.status===429 ? retryDelay(response.headers.get('Retry-After')) : 0
    );
  }

  if (payload.data === undefined) {

    throw new AuthRequestError(
      response.status,
      "INVALID_RESPONSE",
      "서버 응답 데이터가 올바르지 않습니다."
    );
  }

  return payload.data;
}

// ============================================================
// 인증 API POST 요청
// ============================================================

let cookieQueue:Promise<void>=Promise.resolve();
let cookiePending=0;
async function postJson<T>(path:string,body?:unknown):Promise<T>{
 if(cookiePending>=2)throw new AuthRequestError(409,'AUTH_BUSY','앞선 로그인 처리를 마친 뒤 다시 눌러 주세요.');
 cookiePending++;const job=cookieQueue.then(()=>performPostJson<T>(path,body));cookieQueue=job.then(()=>{},()=>{});
 return job.finally(()=>{cookiePending--;});
}
async function performPostJson<T>(
  path: string,
  body?: unknown
): Promise<T> {

  const headers = new Headers();

  headers.set(
    "Accept",
    "application/json"
  );

  if (body !== undefined) {

    headers.set(
      "Content-Type",
      "application/json; charset=utf-8"
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${AUTH_API_BASE_URL}${path}`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      headers,
      signal: controller.signal,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return await readAuthApiResponse<T>(response);
  } catch (error) {
    if (error instanceof AuthRequestError) throw error;
    throw new AuthRequestError(0,
      controller.signal.aborted ? "REQUEST_TIMEOUT" : "NETWORK_ERROR",
      controller.signal.aborted ? "서버 응답 시간이 초과되었습니다." : "서버에 연결할 수 없습니다.");
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// 인증 응답 검증
// ============================================================

function validateAuthResult(
  result: AuthResult,
  requireUser: boolean
): AuthResult {

  if (
    !result ||
    typeof result.accessToken !== "string" ||
    result.accessToken.length === 0
  ) {

    throw new AuthRequestError(
      500,
      "INVALID_AUTH_RESPONSE",
      "서버 인증 응답이 올바르지 않습니다."
    );
  }

  if (requireUser) {

    const user = result.user;

    if (
      !user ||
      typeof user.id !== "string" ||
      typeof user.email !== "string" ||
      typeof user.name !== "string"
    ) {

      throw new AuthRequestError(
        500,
        "INVALID_USER_RESPONSE",
        "회원 정보가 올바르지 않습니다."
      );
    }
  }

  return result;
}

// ============================================================
// 로그인
// ============================================================

export async function loginRequest(
  email: string,
  password: string,
  mfaCode?: string
): Promise<AuthResult> {

  const generation = ++sessionGeneration;

  const result = validateAuthResult(
    await postJson<AuthResult>(
      "/auth/web/login",
      {
        email,
        password,
        ...(mfaCode ? { mfaCode } : {})
      }
    ),
    true
  );

  if (generation !== sessionGeneration) {
    throw new AuthRequestError(409, "AUTH_STATE_CHANGED", "인증 상태가 변경되었습니다. 다시 시도해 주세요.");
  }
  setAccessToken(result.accessToken);

  return result;
}

// ============================================================
// 회원가입
// ============================================================

export async function registerRequest(
  email: string,
  password: string,
  name: string
): Promise<AuthResult> {

  const generation = ++sessionGeneration;

  const result = validateAuthResult(
    await postJson<AuthResult>(
      "/auth/web/register",
      {
        email,
        password,
        name
      }
    ),
    true
  );

  if (generation !== sessionGeneration) {
    throw new AuthRequestError(409, "AUTH_STATE_CHANGED", "인증 상태가 변경되었습니다. 다시 시도해 주세요.");
  }
  setAccessToken(result.accessToken);

  return result;
}

// ============================================================
// Refresh Token 갱신
// ============================================================

// 웹에서는 Refresh Token을 JavaScript로 읽지 않습니다.
// HttpOnly 쿠키가 브라우저에 의해 자동으로 전달됩니다.
//
// 동시에 여러 API가 토큰 갱신을 요청하더라도
// 하나의 Promise를 공유합니다.

export async function refreshSession():
  Promise<AuthResult | null> {

  if(Date.now()<refreshBlockedUntil)throw new AuthRequestError(429,'REFRESH_RATE_LIMITED','요청이 많습니다. 잠시 기다린 뒤 다시 눌러 주세요.',Math.ceil((refreshBlockedUntil-Date.now())/1000));

  if (refreshPromise) {

    return refreshPromise;
  }

  const generation = sessionGeneration;

  const task = (async (): Promise<AuthResult | null> => {

    try {

      const result = validateAuthResult(
        await postJson<AuthResult>(
          "/auth/web/refresh"
        ),
        false
      );

      // 요청 도중 로그아웃 또는 새 로그인이 발생했다면
      // 이전 Refresh 결과를 사용하지 않습니다.

      if (generation !== sessionGeneration) {

        return null;
      }

      accessToken = result.accessToken;

      return result;

    }
    catch (error) {

      if(generation===sessionGeneration&&error instanceof AuthRequestError && error.status===429)refreshBlockedUntil=Date.now()+Math.max(1,error.retryAfterSeconds)*1000;
      // 연결 장애·429·잘못된 응답은 인증 만료가 아닙니다.
      if(!(error instanceof AuthRequestError)||error.status!==401)throw error;

      if (generation === sessionGeneration) {

        accessToken = null;
      }

      return null;
    }

  })();

  refreshPromise = task;

  try {

    return await task;

  }
  finally {

    if (refreshPromise === task) {

      refreshPromise = null;
    }
  }
}

// ============================================================
// 현재 사용자 조회
// ============================================================

export async function fetchCurrentUser():
  Promise<AuthUser> {

  const response = await authorizedFetch(
    "/auth/me",
    {
      method: "GET"
    }
  );

  return readAuthApiResponse<AuthUser>(response);
}

// ============================================================
// 로그아웃
// ============================================================

export async function logoutRequest(): Promise<void> {
  const generation=++sessionGeneration;

  // 서버가 Refresh Token 세션을 폐기한 경우에만
  // 로컬 Access Token을 제거합니다.

  await postJson<{
    loggedOut: boolean;
  }>(
    "/auth/web/logout"
  );

  if(generation===sessionGeneration)clearAccessToken();
}

// ============================================================
// 전체 기기 로그아웃
// ============================================================

export async function logoutAllRequest(): Promise<void> {

  const response = await authorizedFetch(
    "/auth/logout-all",
    {
      method: "POST"
    }
  );

  await readAuthApiResponse<{
    loggedOut: boolean;
  }>(response);

  clearAccessToken();
}

// ============================================================
// 안전한 API 요청 경로
// ============================================================

function createAuthorizedUrl(path: string): string {

  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    path.includes("#") ||
    /[\u0000-\u0020\u007f]/.test(path)
  ) {

    throw new AuthRequestError(
      0,
      "INVALID_API_PATH",
      "API 요청 경로가 올바르지 않습니다."
    );
  }

  const url = new URL(
    `${AUTH_API_BASE_URL}${path}`
  );

  if (
    url.origin !== API_ORIGIN ||
    !url.pathname.startsWith("/api/v1/")
  ) {

    throw new AuthRequestError(
      0,
      "INVALID_API_PATH",
      "허용되지 않은 API 요청 경로입니다."
    );
  }

  return url.toString();
}

// ============================================================
// 인증된 API 요청
// ============================================================

// GET 및 HEAD만 인증 갱신 후 자동 재시도합니다.
//
// POST, PUT, PATCH, DELETE는 중복 실행을 방지하기 위해
// 자동 재전송하지 않습니다.

export async function authorizedFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {

  const requestGeneration=sessionGeneration;
  const assertCurrent=()=>{if(requestGeneration!==sessionGeneration)throw new AuthRequestError(409,'AUTH_STATE_CHANGED','로그인 계정이 변경되었습니다. 현재 계정에서 다시 확인해 주세요.');};
  const recover=async()=>{try{return await refreshSession();}finally{assertCurrent();}};

  const requestUrl = createAuthorizedUrl(path);

  const method = (
    options.method ?? "GET"
  ).toUpperCase();

  const canRetry =
    method === "GET" ||
    method === "HEAD";

  // Access Token이 없으면 Refresh Cookie로 복구합니다.

  if (!accessToken) {

    const refreshed = await recover();

    if (!refreshed) {

      expireSession();

      throw new AuthRequestError(
        401,
        "UNAUTHORIZED",
        "로그인이 필요합니다."
      );
    }
  }

  // ==========================================================
  // 실제 요청
  // ==========================================================

  const send = async (
    token: string
  ): Promise<Response> => {

    const headers = new Headers(
      options.headers
    );

      // 표준 API의 문자열 본문은 JSON입니다. FormData의 boundary는 브라우저에 맡깁니다.
      if (typeof options.body === "string" && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json; charset=utf-8");
      }

    // 호출자가 전달한 Authorization을 그대로 신뢰하지 않고
    // 공통 인증 저장소의 토큰으로 설정합니다.

    headers.set(
      "Authorization",
      `Bearer ${token}`
    );

    return boundedFetch(
      requestUrl,
      {
        ...options,

        method,

        headers,

        credentials: "include",

        cache: "no-store",
        redirect: "error"
      }
    );
  };

  const initialToken = accessToken;
  assertCurrent();

  if (!initialToken) {

    expireSession();

    throw new AuthRequestError(
      401,
      "UNAUTHORIZED",
      "로그인이 필요합니다."
    );
  }

  let response = await send(initialToken);
  assertCurrent();

  if (response.status !== 401) {

    return response;
  }

  // ==========================================================
  // 401 응답 처리
  // ==========================================================

  // 다른 요청이 이미 토큰을 갱신했다면
  // 다시 Refresh 요청을 보내지 않습니다.

  let renewedToken = accessToken;

  if (renewedToken === initialToken) {

    const refreshed = await recover();

    renewedToken = refreshed?.accessToken ?? null;
  }

  if (!renewedToken) {

    expireSession();

    throw new AuthRequestError(
      401,
      "SESSION_EXPIRED",
      "로그인 세션이 만료되었습니다."
    );
  }

  // 변경 요청은 자동 재실행하지 않습니다.

  if (!canRetry) {

    throw new AuthRequestError(
      401,
      "RETRY_REQUIRED",
      "인증이 갱신되었습니다. 요청을 다시 실행해 주세요."
    );
  }

  // 조회 요청만 한 번 재시도합니다.

  response = await send(renewedToken);
  assertCurrent();

  if (response.status === 401) {

    expireSession();

    throw new AuthRequestError(
      401,
      "SESSION_EXPIRED",
      "로그인 세션이 만료되었습니다."
    );
  }

  return response;
}

function retryDelay(value:string|null){if(!value)return 60;const seconds=Number(value);return Number.isFinite(seconds)?Math.max(1,Math.ceil(seconds)):Math.max(1,Math.ceil((Date.parse(value)-Date.now())/1000))||60;}
async function boundedFetch(url:string,options:RequestInit){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 const signal=options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal;
 try{return await fetch(url,{...options,signal});}catch(error){if(error instanceof AuthRequestError)throw error;throw new AuthRequestError(0,controller.signal.aborted?'REQUEST_TIMEOUT':'NETWORK_ERROR',controller.signal.aborted?'서버 응답 시간이 초과되었습니다. 다시 눌러 주세요.':'서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');}finally{clearTimeout(timer);}
}
async function boundedJson(response:Response){let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([response.json().catch(()=>null),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new AuthRequestError(0,'REQUEST_TIMEOUT','서버 응답을 끝까지 받지 못했습니다. 다시 눌러 주세요.')),15000);})]);}finally{if(timer)clearTimeout(timer);}}

