import { authScope } from "./auth-scope";
// filepath: apps/api/src/common/auth.middleware.ts - JWT 검증과 회원별 접근 권한 검사
import {
  RequestHandler
} from "express";

import jwt from "jsonwebtoken";

import { env } from "../config/env";
import { prisma } from "../infrastructure/prisma";
import { AppError } from "./app-error";
import { asyncHandler } from "./validate";

// Access Token 발급
export function createAccessToken(
  userId: string,
  tokenVersion: number
): string {
  return jwt.sign(
    {
      ver: tokenVersion
    },
    env.JWT_ACCESS_SECRET,
    {
      algorithm: "HS256",
      subject: userId,
      ...authScope(env.APP_ENV),
      expiresIn: "15m"
    }
  );
}

// Access Token 검증
export const requireAuth: RequestHandler = asyncHandler(
  async (req, _res, next) => {
    const authorization = req.headers.authorization;

    if (
      !authorization ||
      !authorization.startsWith("Bearer ")
    ) {
      throw new AppError(
        401,
        "UNAUTHORIZED",
        "로그인이 필요합니다."
      );
    }

    const token = authorization.slice(7);

    let payload: jwt.JwtPayload;

    try {
      const decoded = jwt.verify(
        token,
        env.JWT_ACCESS_SECRET,
        {
          algorithms: ["HS256"],
          ...authScope(env.APP_ENV)
        }
      );

      if (typeof decoded === "string") {
        throw new Error("토큰 형식 오류");
      }

      payload = decoded;
    } catch {
      throw new AppError(
        401,
        "INVALID_TOKEN",
        "인증 토큰이 만료되었거나 올바르지 않습니다."
      );
    }

    if (
      typeof payload.sub !== "string" ||
      typeof payload.ver !== "number" ||
      !Number.isSafeInteger(payload.ver) || payload.ver < 0 ||
      typeof payload.exp !== "number" ||
      typeof payload.iat !== "number"
    ) {
      throw new AppError(
        401,
        "INVALID_TOKEN",
        "인증 정보가 올바르지 않습니다."
      );
    }

    // 회원 탈퇴 또는 전체 로그아웃 여부를 확인합니다.
    const user = await prisma.user.findUnique({
      where: {
        id: payload.sub
      },
      select: {
        id: true,
        tokenVersion: true, suspendedAt: true, deletedAt: true
      }
    });

    if (
      !user || user.suspendedAt || user.deletedAt ||
      user.tokenVersion !== payload.ver
    ) {
      throw new AppError(
        401,
        "SESSION_REVOKED",
        "로그인 세션이 종료되었습니다."
      );
    }

    req.userId = user.id;

    next();
  }
);

