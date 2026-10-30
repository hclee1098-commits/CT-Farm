// filepath: apps/api/src/config/env.ts - 환경 변수를 검증하고 안전한 설정 객체로 변환
import "dotenv/config";
import { envSchema } from "./env.schema";

// 환경 변수의 타입과 필수 조건을 검사합니다.
// 환경 변수에 문제가 있으면 서버 시작을 중단합니다.
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const fields = parsed.error.issues
    .map((issue) => issue.path.join("."))
    .join(", ");

  throw new Error(
    `환경 변수 설정이 올바르지 않습니다. 확인할 항목: ${fields}`
  );
}

export const env = {
  ...parsed.data,

  CORS_ORIGIN_LIST: parsed.data.CORS_ORIGINS
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),

  IS_PRODUCTION: parsed.data.NODE_ENV === "production"
};

