import { describe, expect, it } from "vitest";
import { envSchema } from "./env.schema";
const valid = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  JWT_ACCESS_SECRET: "a".repeat(64),
  CORS_ORIGINS: "http://localhost:3000"
};
describe("환경 설정 보안", () => {
  it("로컬 기본 설정과 공백으로 구분한 출처를 허용합니다", () => {
    expect(envSchema.safeParse({ ...valid, CORS_ORIGINS: "http://localhost:3000, https://example.com" }).success).toBe(true);
  });
  it.each(["*", "null", ",", "https://example.com/", "https://user:pass@example.com", "http://localhost:3000,"])("잘못된 출처 %s 거부", (origin) => {
    expect(envSchema.safeParse({ ...valid, CORS_ORIGINS: origin }).success).toBe(false);
  });
  it.each(["REPLACE_WITH_A_RANDOM_SECRET_AT_LEAST_32_CHARACTERS_LONG", "your_secret".repeat(8)])("예시 비밀키 거부", (secret) => {
    expect(envSchema.safeParse({ ...valid, JWT_ACCESS_SECRET: secret }).success).toBe(false);
  });
  it("운영 환경의 HTTP 웹 출처를 거부합니다", () => {
    expect(envSchema.safeParse({ ...valid, NODE_ENV: "production" }).success).toBe(false);
    expect(envSchema.safeParse({ ...valid, NODE_ENV: "production", APP_ENV: "PRODUCTION", CORS_ORIGINS: "https://example.com" }).success).toBe(true);
  });
  it.each([{ DATABASE_URL: "sqlite:foo" }, { REDIS_URL: "https://localhost" }, { UPLOAD_DIR: " " }])("잘못된 연결 및 저장 경로 거부", (invalid) => {
    expect(envSchema.safeParse({ ...valid, ...invalid }).success).toBe(false);
  });
});

