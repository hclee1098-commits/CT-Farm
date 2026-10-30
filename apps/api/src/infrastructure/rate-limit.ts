// filepath: apps/api/src/infrastructure/rate-limit.ts - Redis 기반 API 요청 횟수 제한과 브루트포스 방어
import { connectRedis as ensureRateLimitRedis } from "./redis";
import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";

import { redis } from "./redis";
import { failure } from "../common/response";

// Redis 저장소를 생성합니다.
// 서버가 여러 대여도 요청 횟수를 공유합니다.
function createStore(prefix: string) {
  return new RedisStore({
    prefix,

    sendCommand: async (...args: string[]) => {
      await ensureRateLimitRedis();
      return await redis.sendCommand(args);
    }
  });
}

// 일반 API 요청 제한
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,

  standardHeaders: "draft-7",
  legacyHeaders: false,

  store: createStore("rate:api:"),

  handler: (_req, res) => {
    failure(
      res,
      429,
      "RATE_LIMITED",
      "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
    );
  }
});

// 로그인 및 회원가입 요청 제한
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,

  standardHeaders: "draft-7",
  legacyHeaders: false,

  store: createStore("rate:auth:"),

  handler: (_req, res) => {
    failure(
      res,
      429,
      "AUTH_RATE_LIMITED",
      "인증 요청이 너무 많습니다. 15분 후 다시 시도해 주세요."
    );
  }
});

// Refresh Token 갱신 요청 제한
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,

  standardHeaders: "draft-7",
  legacyHeaders: false,

  store: createStore("rate:refresh:"),

  handler: (_req, res) => {
    failure(
      res,
      429,
      "REFRESH_RATE_LIMITED",
      "토큰 갱신 요청이 너무 많습니다."
    );
  }
});


// 계정 설정과 관리자 작업은 로그인 요청 제한과 독립된 저장소를 사용합니다.
export const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false,
  store: createStore("rate:sensitive:"),
  handler: (_req, res) => failure(res, 429, "SENSITIVE_RATE_LIMITED", "민감한 작업 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.")
});
