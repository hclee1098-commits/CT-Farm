// filepath: apps/api/src/bootstrap/runtime.config.ts - 서버 포트, 프록시 및 종료 시간 환경 변수 검증
import { z } from "zod";

// ============================================================
// 런타임 환경 변수 검증
// ============================================================

// 기존 env.ts의 데이터베이스, JWT, CORS 설정은
// 그대로 사용합니다.
//
// 이 파일은 통합 서버 실행에 필요한
// 추가 설정만 관리합니다.

const runtimeSchema = z.object({

  PORT: z.coerce.number()
    .int()
    .min(1)
    .max(65535)
    .default(4000),

  TRUST_PROXY_HOPS: z.coerce.number()
    .int()
    .min(0)
    .max(10)
    .default(0),

  JSON_BODY_LIMIT: z.enum([
    "256kb",
    "512kb",
    "1mb",
    "2mb"
  ]).default("1mb"),

  SHUTDOWN_TIMEOUT_MS: z.coerce.number()
    .int()
    .min(1000)
    .max(30000)
    .default(10000)

});

// ============================================================
// 환경 변수 읽기
// ============================================================

const result = runtimeSchema.safeParse({

  PORT: process.env.PORT,

  TRUST_PROXY_HOPS: process.env.TRUST_PROXY_HOPS,

  JSON_BODY_LIMIT: process.env.JSON_BODY_LIMIT,

  SHUTDOWN_TIMEOUT_MS:
    process.env.SHUTDOWN_TIMEOUT_MS

});

// ============================================================
// 설정 오류 처리
// ============================================================

if (!result.success) {

  // 환경 변수 값을 그대로 출력하면
  // 민감 정보가 노출될 수 있으므로
  // 오류가 발생한 필드명만 출력합니다.

  const fields = result.error.issues
    .map((issue) => issue.path.join("."))
    .join(", ");

  throw new Error(
    `서버 환경 변수 설정이 올바르지 않습니다: ${fields}`
  );
}

export const runtimeConfig = result.data;

