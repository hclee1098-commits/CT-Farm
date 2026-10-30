// filepath: apps/api/src/modules/auth/auth.dto.ts - 회원가입과 로그인 및 토큰 갱신 요청 데이터 검증
import { z } from "zod";

// 이메일 형식을 검증하고 소문자로 통일합니다.
const emailSchema = z.string()
  .trim()
  .email("올바른 이메일 주소를 입력해 주세요.")
  .max(254, "이메일 주소가 너무 깁니다.")
  .transform((value) => value.toLowerCase());

// bcrypt는 비밀번호의 앞 72바이트까지만 사용합니다.
// 따라서 UTF-8 기준으로 72바이트를 초과하지 않도록 제한합니다.
const passwordSchema = z.string()
  .min(12, "비밀번호는 최소 12자 이상이어야 합니다.")
  .max(128, "비밀번호가 너무 깁니다.")
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "비밀번호는 UTF-8 기준 72바이트 이하여야 합니다."
  );

// 회원가입 요청 검증
export const registerSchema = z.object({
  email: emailSchema,

  password: passwordSchema,

  name: z.string()
    .trim()
    .min(2, "이름은 최소 2자 이상이어야 합니다.")
    .max(60, "이름은 최대 60자까지 입력할 수 있습니다.")
}).strict();

export { passwordSchema, emailSchema };

// 로그인 요청 검증
export const loginSchema = z.object({
  mfaCode: z.string().regex(/^(?:[0-9]{6}|[a-f0-9]{32})$/).optional(),
  email: emailSchema,

  password: z.string()
    .min(1, "비밀번호를 입력해 주세요.")
    .max(128, "비밀번호가 너무 깁니다.")
    .refine((value) => Buffer.byteLength(value, "utf8") <= 72,
      "비밀번호는 UTF-8 기준 72바이트 이하여야 합니다.")
}).strict();

// 모바일 Refresh Token 갱신 요청
export const refreshSchema = z.object({
  refreshToken: z.string()
    .min(40, "Refresh Token 형식이 올바르지 않습니다.")
    .max(256, "Refresh Token 형식이 올바르지 않습니다.")
}).strict();

// 모바일 로그아웃 요청
export const logoutSchema = refreshSchema;

// 타입 정의
export type RegisterInput = z.infer<typeof registerSchema>;

export type LoginInput = z.infer<typeof loginSchema>;

export type RefreshInput = z.infer<typeof refreshSchema>;

export type LogoutInput = z.infer<typeof logoutSchema>;

