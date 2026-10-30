// filepath: apps/api/src/modules/auth/auth.dto.test.ts - 회원가입과 로그인 요청값 검증 자동 테스트
import {
  describe,
  expect,
  it
} from "vitest";

import {
  registerSchema,
  loginSchema,
  refreshSchema
} from "./auth.dto";

describe("회원가입 입력값 검증", () => {

  it("올바른 회원가입 요청을 허용합니다.", () => {

    const result = registerSchema.safeParse({
      email: "TEST@EXAMPLE.COM",
      password: "StrongPassword123!",
      name: "테스트회원"
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.email).toBe(
        "test@example.com"
      );
    }
  });

  it("잘못된 이메일을 거부합니다.", () => {

    const result = registerSchema.safeParse({
      email: "invalid-email",
      password: "StrongPassword123!",
      name: "테스트회원"
    });

    expect(result.success).toBe(false);
  });

  it("짧은 비밀번호를 거부합니다.", () => {

    const result = registerSchema.safeParse({
      email: "test@example.com",
      password: "1234",
      name: "테스트회원"
    });

    expect(result.success).toBe(false);
  });

  it("bcrypt 허용 바이트를 초과한 비밀번호를 거부합니다.", () => {

    const result = registerSchema.safeParse({
      email: "test@example.com",
      password: "가".repeat(30),
      name: "테스트회원"
    });

    expect(result.success).toBe(false);
  });

  it("허용되지 않은 추가 필드를 거부합니다.", () => {

    const result = registerSchema.safeParse({
      email: "test@example.com",
      password: "StrongPassword123!",
      name: "테스트회원",
      isAdmin: true
    });

    expect(result.success).toBe(false);
  });
});

describe("로그인 입력값 검증", () => {

  it("정상적인 로그인 요청을 허용합니다.", () => {

    const result = loginSchema.safeParse({
      email: "test@example.com",
      password: "StrongPassword123!"
    });

    expect(result.success).toBe(true);
  });

  it("비밀번호가 없는 요청을 거부합니다.", () => {

    const result = loginSchema.safeParse({
      email: "test@example.com",
      password: ""
    });

    expect(result.success).toBe(false);
  });
});

describe("Refresh Token 입력값 검증", () => {

  it("너무 짧은 Refresh Token을 거부합니다.", () => {

    const result = refreshSchema.safeParse({
      refreshToken: "short"
    });

    expect(result.success).toBe(false);
  });
});

describe("로그인 bcrypt 잘림 방지", () => {
  it.each(["a".repeat(73), "가".repeat(25)])("72바이트 초과 로그인 입력을 거부합니다", (password) => {
    expect(loginSchema.safeParse({ email: "test@example.com", password }).success).toBe(false);
  });
  it("72바이트 경계의 기존 비밀번호는 허용합니다", () => {
    expect(loginSchema.safeParse({ email: "test@example.com", password: "가".repeat(24) }).success).toBe(true);
  });
});

