// filepath: apps/api/src/infrastructure/logger.ts - 비밀번호와 인증 토큰 노출을 방지하는 구조화된 로깅
import pino from "pino";
import { env } from "../config/env";

// JSON 형태의 로그를 생성합니다.
export const logger = pino({
  level: env.LOG_LEVEL,

  base: {
    service: "starter-api",
    environment: env.NODE_ENV
  },

  // 외부 오류 메시지는 연결 URL/자격증명을 포함할 수 있어 기록하지 않습니다.
  serializers: {
    err: () => ({ type: "Error", message: "외부 오류 상세 생략" }),
    error: () => ({ type: "Error", message: "외부 오류 상세 생략" })
  },
  // 민감한 HTTP 헤더가 로그에 남지 않도록 설정합니다.
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
      "password",
      "passwordHash",
      "refreshToken",
      "accessToken",
      "mfaSecret", "mfaCode", "recoveryCodes", "token", "secret",
      "*.password", "*.passwordHash", "*.refreshToken", "*.accessToken", "*.mfaSecret"
    ],
    censor: "[보안상 비공개]"
  }
});

