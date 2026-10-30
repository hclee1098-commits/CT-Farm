// filepath: apps/web/src/shared/auth/auth-provider.tsx - 전체 Starter 화면의 단일 인증 상태와 세션 복구 및 탭 간 로그아웃 동기화
"use client";
import {clearFieldDrafts} from './field-drafts';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import type {
  ReactNode
} from "react";

import {
  AUTH_EXPIRED_EVENT,
  authorizedFetch,
  clearAccessToken,
  fetchCurrentUser,
  loginRequest,
  logoutAllRequest,
  logoutRequest,
  readAuthApiResponse,
  refreshSession,
  registerRequest
} from "./auth-client";

import type {
  AuthUser
} from "./auth-client";

// ============================================================
// 인증 상태
// ============================================================

export type AuthStatus =
  | "checking"
  | "authenticated"
  | "unavailable"
  | "guest";

// ============================================================
// 인증 Context
// ============================================================

interface AuthContextValue {

  status: AuthStatus;

  user: AuthUser | null;

  loading: boolean;

  login(
    email: string,
    password: string,
    mfaCode?: string
  ): Promise<void>;

  register(
    email: string,
    password: string,
    name: string
  ): Promise<void>;

  logout(): Promise<void>;

  logoutAll(): Promise<void>;

  refresh(): Promise<boolean>;

  request<T>(
    path: string,
    options?: RequestInit
  ): Promise<T>;

  authorizedFetch(
    path: string,
    options?: RequestInit
  ): Promise<Response>;
}

const AuthContext =
  createContext<AuthContextValue | null>(null);

// ============================================================
// 탭 간 동기화
// ============================================================

const AUTH_CHANNEL = "starter-auth-events";

// ============================================================
// 공통 인증 Provider
// ============================================================

export function AuthProvider({
  children
}: {
  children: ReactNode;
}) {

  const [status, setStatus] =
    useState<AuthStatus>("checking");

  const [user, setUser] =
    useState<AuthUser | null>(null);
  const [connectionError,setConnectionError]=useState('');

  // 오래된 초기화 요청이 새로운 로그인 상태를
  // 덮어쓰지 못하도록 작업 세대를 관리합니다.

  const revisionRef = useRef(0);

  const channelRef =
    useRef<BroadcastChannel | null>(null);

  // ==========================================================
  // 비로그인 상태 적용
  // ==========================================================

  const setGuest = useCallback(() => {
    try { clearFieldDrafts(sessionStorage); } catch { /* 저장소 차단 환경에서도 로그아웃합니다. */ }

    setUser(null);

    setStatus("guest");

  }, []);

  // ==========================================================
  // 로그인 상태 적용
  // ==========================================================

  const setAuthenticated = useCallback(
    (currentUser: AuthUser) => {
      setConnectionError('');
      try { clearFieldDrafts(sessionStorage,currentUser.id); } catch { /* 인증에 영향을 주지 않습니다. */ }

      setUser(currentUser);

      setStatus("authenticated");

    },
    []
  );

  // ==========================================================
  // 초기 세션 복구
  // ==========================================================

  useEffect(() => {

    let active = true;

    const revision = revisionRef.current;

    const initialize = async () => {

      try {

        const result = await refreshSession();

        if (!result) {

          if (
            active &&
            revision === revisionRef.current
          ) {

            setGuest();
          }

          return;
        }

        // Refresh 응답에는 회원 정보가 없으므로
        // /auth/me API에서 사용자 정보를 가져옵니다.

        const currentUser =
          await fetchCurrentUser();

        if (
          active &&
          revision === revisionRef.current
        ) {

          setAuthenticated(currentUser);
        }

      }
      catch (error) {

        if (
          active &&
          revision === revisionRef.current
        ) {

          setConnectionError(error instanceof Error?error.message:'서버에 연결할 수 없습니다.');
          setStatus('unavailable');
        }
      }
    };

    void initialize();

    // ========================================================
    // 인증 만료 이벤트
    // ========================================================

    const handleExpired = () => {

      revisionRef.current++;

      setGuest();
    };

    window.addEventListener(
      AUTH_EXPIRED_EVENT,
      handleExpired
    );

    // ========================================================
    // 다른 브라우저 탭의 로그아웃
    // ========================================================

    if (typeof BroadcastChannel !== "undefined") {

      const channel =
        new BroadcastChannel(AUTH_CHANNEL);

      channelRef.current = channel;

      channel.onmessage = (event) => {

        if (event.data === "logout") {

          revisionRef.current++;

          clearAccessToken();

          setGuest();
        }
      };
    }

    return () => {

      active = false;

      window.removeEventListener(
        AUTH_EXPIRED_EVENT,
        handleExpired
      );

      channelRef.current?.close();

      channelRef.current = null;
    };

  }, [
    setAuthenticated,
    setGuest
  ]);

  // ==========================================================
  // 로그인
  // ==========================================================

  const login = useCallback(
    async (
      email: string,
      password: string,
    mfaCode?: string
    ) => {

      const revision = ++revisionRef.current;

      const result = await loginRequest(
        email,
        password,
        mfaCode
      );

      if (!result.user) {

        throw new Error(
          "로그인 사용자 정보가 없습니다."
        );
      }

      if (revision === revisionRef.current) {

        setAuthenticated(result.user);
      }

    },
    [setAuthenticated]
  );

  // ==========================================================
  // 회원가입
  // ==========================================================

  const register = useCallback(
    async (
      email: string,
      password: string,
      name: string
    ) => {

      const revision = ++revisionRef.current;

      const result = await registerRequest(
        email,
        password,
        name
      );

      if (!result.user) {

        throw new Error(
          "회원가입 사용자 정보가 없습니다."
        );
      }

      if (revision === revisionRef.current) {

        setAuthenticated(result.user);
      }

    },
    [setAuthenticated]
  );

  // ==========================================================
  // 다른 탭에 로그아웃 알림
  // ==========================================================

  const broadcastLogout = useCallback(() => {

    channelRef.current?.postMessage("logout");

  }, []);

  // ==========================================================
  // 현재 기기 로그아웃
  // ==========================================================

  const logout = useCallback(async () => {

    const revision=++revisionRef.current;

    await logoutRequest();

    if(revision===revisionRef.current){setGuest();broadcastLogout();}

  }, [
    setGuest,
    broadcastLogout
  ]);

  // ==========================================================
  // 전체 기기 로그아웃
  // ==========================================================

  const logoutAll = useCallback(async () => {

    const revision=++revisionRef.current;

    await logoutAllRequest();

    if(revision===revisionRef.current){setGuest();broadcastLogout();}

  }, [
    setGuest,
    broadcastLogout
  ]);

  // ==========================================================
  // 수동 세션 갱신
  // ==========================================================

  const refresh = useCallback(
    async (): Promise<boolean> => {

      const revision = ++revisionRef.current;

      try {

        const result = await refreshSession();

        if (!result) {

          if (revision === revisionRef.current) {

            setGuest();
          }

          return false;
        }

        const currentUser =
          await fetchCurrentUser();

        if (revision === revisionRef.current) {

          setAuthenticated(currentUser);
        }

        return true;

      }
      catch (error) {

        if (revision === revisionRef.current) {

          setConnectionError(error instanceof Error?error.message:'서버에 연결할 수 없습니다.');
          setStatus('unavailable');
        }

        return false;
      }

    },
    [
      setAuthenticated,
      setGuest
    ]
  );

  // ==========================================================
  // 인증된 HTTP 요청
  // ==========================================================

  const fetchAuthorized = useCallback(
    async (
      path: string,
      options: RequestInit = {}
    ): Promise<Response> => {

      return authorizedFetch(path, options);

    },
    []
  );

  // ==========================================================
  // 표준 JSON API 요청
  // ==========================================================

  const request = useCallback(
    async <T,>(
      path: string,
      options: RequestInit = {}
    ): Promise<T> => {

      const response = await fetchAuthorized(
        path,
        options
      );

      return readAuthApiResponse<T>(response);

    },
    [fetchAuthorized]
  );

  // ==========================================================
  // Context 값
  // ==========================================================

  const value = useMemo<AuthContextValue>(
    () => ({

      status,

      user,

      loading: status === "checking",

      login,

      register,

      logout,

      logoutAll,

      refresh,

      request,

      authorizedFetch: fetchAuthorized

    }),
    [
      status,
      user,
      login,
      register,
      logout,
      logoutAll,
      refresh,
      request,
      fetchAuthorized
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {status==='unavailable'&&<section role="alert" style={{padding:'1rem',fontSize:'1.125rem'}}><p>{connectionError} 초안은 지우지 않았습니다.</p><button type="button" onClick={()=>void refresh()}>연결 다시 확인</button> <a href="/starter/login">로그인 화면</a></section>}
      {children}
    </AuthContext.Provider>
  );
}

// ============================================================
// 인증 상태 Hook
// ============================================================

export function useAuth(): AuthContextValue {

  const context = useContext(AuthContext);

  if (!context) {

    throw new Error(
      "AuthProvider 내부에서 useAuth를 사용해야 합니다."
    );
  }

  return context;
}

