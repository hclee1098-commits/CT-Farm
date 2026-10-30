// filepath: apps/api/src/modules/auth/auth.controller.ts - 웹과 모바일 앱의 인증 API 라우팅 및 응답 처리
import {
  Router,
  Request,
  Response,
  NextFunction
} from "express";

import { env } from "../../config/env";

import { AppError } from "../../common/app-error";
import { success } from "../../common/response";

import {
  validate,
  asyncHandler
} from "../../common/validate";

import {
  requireAuth
} from "../../common/auth.middleware";

import {
  authLimiter,
  refreshLimiter
} from "../../infrastructure/rate-limit";

import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema
} from "./auth.dto";

import type {
  RegisterInput,
  LoginInput,
  RefreshInput,
  LogoutInput
} from "./auth.dto";

import {
  authService,
  REFRESH_TOKEN_MAX_AGE_MS
} from "./auth.service";

// 인증 라우터
export const authRouter = Router();

// 운영 환경에서는 __Host- 접두사를 사용합니다.
// 해당 접두사는 Secure 및 Path=/ 조건을 요구합니다.
const REFRESH_COOKIE_NAME = env.IS_PRODUCTION
  ? "__Host-refresh_token"
  : "refresh_token";

// 웹 브라우저용 Refresh Token 쿠키 설정
function setRefreshCookie(
  res: Response,
  refreshToken: string
): void {
  res.cookie(
    REFRESH_COOKIE_NAME,
    refreshToken,
    {
      httpOnly: true,
      secure: env.IS_PRODUCTION,
      sameSite: "strict",
      path: "/",
      maxAge: REFRESH_TOKEN_MAX_AGE_MS
    }
  );
}

// 웹 브라우저용 Refresh Token 쿠키 삭제
function clearRefreshCookie(res: Response): void {
  res.clearCookie(
    REFRESH_COOKIE_NAME,
    {
      httpOnly: true,
      secure: env.IS_PRODUCTION,
      sameSite: "strict",
      path: "/"
    }
  );
}

// 웹 요청의 Origin을 검증합니다.
// CORS 설정만으로는 CSRF 공격을 완전히 막을 수 없으므로
// 쿠키를 사용하는 인증 API에 추가 검증을 적용합니다.
function requireWebOrigin(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const origin = req.headers.origin;

  if (
    !origin ||
    !env.CORS_ORIGIN_LIST.includes(origin)
  ) {
    return next(
      new AppError(
        403,
        "INVALID_ORIGIN",
        "허용되지 않은 웹 출처에서 요청했습니다."
      )
    );
  }

  next();
}

// 웹 쿠키에서 Refresh Token 추출
function getWebRefreshToken(req: Request): string {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];

  if (
    typeof token !== "string" ||
    token.length < 40 ||
    token.length > 256
  ) {
    throw new AppError(
      401,
      "REFRESH_TOKEN_REQUIRED",
      "로그인 세션이 없습니다."
    );
  }

  return token;
}


// ============================================================
// 웹 회원가입
// ============================================================

authRouter.post(
  "/web/register",
  requireWebOrigin,
  authLimiter,
  validate("body", registerSchema),
  asyncHandler(async (req, res) => {

    const input = req.body as RegisterInput;

    const result = await authService.register(input);

    // 웹은 Refresh Token을 JSON으로 반환하지 않습니다.
    setRefreshCookie(
      res,
      result.refreshToken
    );

    success(
      res,
      {
        user: result.user,
        accessToken: result.accessToken
      },
      "회원가입이 완료되었습니다.",
      201
    );
  })
);


// ============================================================
// 웹 로그인
// ============================================================

authRouter.post(
  "/web/login",
  requireWebOrigin,
  authLimiter,
  validate("body", loginSchema),
  asyncHandler(async (req, res) => {

    const input = req.body as LoginInput;

    const result = await authService.login(input);

    setRefreshCookie(
      res,
      result.refreshToken
    );

    success(
      res,
      {
        user: result.user,
        accessToken: result.accessToken
      },
      "로그인되었습니다."
    );
  })
);


// ============================================================
// 웹 Refresh Token 갱신
// ============================================================

authRouter.post(
  "/web/refresh",
  requireWebOrigin,
  refreshLimiter,
  asyncHandler(async (req, res) => {

    const refreshToken = getWebRefreshToken(req);

    const result = await authService.refresh(
      refreshToken
    );

    // 새로운 Refresh Token으로 쿠키 교체
    setRefreshCookie(
      res,
      result.refreshToken
    );

    success(
      res,
      {
        accessToken: result.accessToken
      },
      "인증 토큰이 갱신되었습니다."
    );
  })
);


// ============================================================
// 웹 로그아웃
// ============================================================

authRouter.post(
  "/web/logout",
  requireWebOrigin,
  asyncHandler(async (req, res) => {

    const refreshToken =
      req.cookies?.[REFRESH_COOKIE_NAME];

    if (typeof refreshToken === "string") {
      await authService.logout(refreshToken);
    }

    clearRefreshCookie(res);

    success(
      res,
      {
        loggedOut: true
      },
      "로그아웃되었습니다."
    );
  })
);


// ============================================================
// 모바일 앱 회원가입
// ============================================================

authRouter.post(
  "/mobile/register",
  authLimiter,
  validate("body", registerSchema),
  asyncHandler(async (req, res) => {

    const input = req.body as RegisterInput;

    const result = await authService.register(input);

    // 모바일 앱은 Refresh Token을 안전한 저장소에
    // 보관할 수 있도록 응답 본문으로 전달합니다.
    success(
      res,
      {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      },
      "회원가입이 완료되었습니다.",
      201
    );
  })
);


// ============================================================
// 모바일 앱 로그인
// ============================================================

authRouter.post(
  "/mobile/login",
  authLimiter,
  validate("body", loginSchema),
  asyncHandler(async (req, res) => {

    const input = req.body as LoginInput;

    const result = await authService.login(input);

    success(
      res,
      {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      },
      "로그인되었습니다."
    );
  })
);


// ============================================================
// 모바일 앱 Refresh Token 갱신
// ============================================================

authRouter.post(
  "/mobile/refresh",
  refreshLimiter,
  validate("body", refreshSchema),
  asyncHandler(async (req, res) => {

    const input = req.body as RefreshInput;

    const result = await authService.refresh(
      input.refreshToken
    );

    success(
      res,
      {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      },
      "인증 토큰이 갱신되었습니다."
    );
  })
);


// ============================================================
// 모바일 앱 로그아웃
// ============================================================

authRouter.post(
  "/mobile/logout",
  validate("body", logoutSchema),
  asyncHandler(async (req, res) => {

    const input = req.body as LogoutInput;

    const result = await authService.logout(
      input.refreshToken
    );

    success(
      res,
      result,
      "로그아웃되었습니다."
    );
  })
);


// ============================================================
// 내 정보 조회
// ============================================================

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {

    const userId = req.userId!;

    const user = await authService.getMe(
      userId
    );

    success(
      res,
      user,
      "회원 정보를 조회했습니다."
    );
  })
);


// ============================================================
// 전체 기기 로그아웃
// ============================================================

authRouter.post(
  "/logout-all",
  requireAuth,
  asyncHandler(async (req, res) => {

    const userId = req.userId!;

    const result = await authService.logoutAll(
      userId
    );

    // 웹 브라우저에 저장된 쿠키도 삭제합니다.
    clearRefreshCookie(res);

    success(
      res,
      result,
      "모든 기기에서 로그아웃되었습니다."
    );
  })
);

