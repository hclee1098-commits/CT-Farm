import { z } from "zod";

export const envSchema = z.object({
  APP_ENV: z.enum(["LOCAL","STAGING","PRODUCTION"]).default("LOCAL"),
  NAVER_MAP_KEY_ID:z.string().regex(/^[a-zA-Z0-9_-]{4,100}$/).optional(),
  AI_MODE:z.enum(['REFERENCE','OPENAI']).default('REFERENCE'),
  AI_API_KEY:z.string().min(20).max(500).optional(),
  AI_MODEL:z.string().regex(/^[a-zA-Z0-9._:-]{1,100}$/).optional(),
  AI_DAILY_TOKEN_LIMIT:z.coerce.number().int().min(1000).max(1000000).default(30000),
  PAYMENT_MODE:z.enum(['DISABLED','SIMULATOR','TOSS_TEST']).default('DISABLED'),
  TOSS_TEST_SECRET_KEY:z.string().regex(/^test_(?:sk|gsk)_[a-zA-Z0-9_-]+$/).optional(),
  WEATHER_MODE: z.enum(['DISABLED','OPEN_METEO_NON_COMMERCIAL','OPEN_METEO_CUSTOMER']).default('DISABLED'),
  WEATHER_API_KEY: z.string().min(1).max(500).optional(),
  FARM_ASSISTANT_ENABLED: z.enum(['true','false']).default('false'),
  NODE_ENV: z.enum([
    "development",
    "test",
    "production"
  ]).default("development"),

  PORT: z.coerce.number()
    .int()
    .min(1)
    .max(65535)
    .default(4000),

  DATABASE_URL: z.string()
    .url().refine((value) => /^postgres(?:ql)?:\/\//.test(value), "PostgreSQL URL이 필요합니다."),

  REDIS_URL: z.string()
    .url().refine((value) => /^rediss?:\/\//.test(value), "Redis URL이 필요합니다."),

  JWT_ACCESS_SECRET: z.string()
    .min(32, "JWT 비밀키는 최소 32자 이상이어야 합니다.")
    .refine((value) => !/replace|change.?me|your.?secret/i.test(value), "예시 비밀키를 교체해야 합니다."),

  CORS_ORIGINS: z.string()
    .min(1, "허용할 웹 출처를 설정해야 합니다.")
    .refine((value) => value.split(",").every((item) => {
      const origin = item.trim();
      try {
        const url = new URL(origin);
        return /^https?:$/.test(url.protocol) && url.origin === origin;
      } catch { return false; }
    }), "HTTP(S) 출처만 쉼표로 구분해 지정하세요."),

  TRUST_PROXY_HOPS: z.coerce.number()
    .int()
    .min(0)
    .max(10)
    .default(0),

  UPLOAD_DIR: z.string().trim().min(1)
    .default("./uploads"),

  MFA_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, "MFA 암호화키는 32바이트 HEX 형식이어야 합니다.").optional(),
  LOG_LEVEL: z.enum([
    "fatal",
    "error",
    "warn",
    "info",
    "debug",
    "trace"
  ]).default("info")
}).superRefine((values, context) => {
  if (values.NODE_ENV === "production" && values.APP_ENV === "LOCAL") {
    context.addIssue({code:"custom",path:["APP_ENV"],message:"서버 환경은 STAGING 또는 PRODUCTION을 명시하세요."});
  }
  if (values.APP_ENV !== "LOCAL" && values.NODE_ENV !== "production") {
    context.addIssue({code:"custom",path:["NODE_ENV"],message:"원격 환경은 production 런타임을 사용하세요."});
  }
  if (values.NODE_ENV === "production" &&
      values.CORS_ORIGINS.split(",").some((origin) => !origin.trim().startsWith("https://"))) {
    context.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "운영 웹 출처는 HTTPS여야 합니다." });
  }
});


