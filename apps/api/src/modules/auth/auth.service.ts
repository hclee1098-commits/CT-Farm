// filepath: apps/api/src/modules/auth/auth.service.ts - 회원가입, 로그인, JWT 발급, 토큰 교체 및 로그아웃 처리
import bcrypt from "bcrypt";
import { verifyMfa } from "./mfa";
import crypto from "node:crypto";

import { AppError } from "../../common/app-error";
import { createAccessToken } from "../../common/auth.middleware";

import { authRepository } from "./auth.repository";

import type {
  RegisterInput,
  LoginInput
} from "./auth.dto";

// 비밀번호 해싱 비용
const BCRYPT_ROUNDS = 12;
// 요청마다 더미 해시를 만들지 않고 실제 비밀번호와 같은 비용으로 비교합니다.
const DUMMY_PASSWORD_HASH = "$2b$12$g4wFEEJsIg5CJmbHOq5LGumor7tYhSjid3/8oyFgQ3aMZs/vhmKTu";

// Refresh Token 유효기간: 30일
export const REFRESH_TOKEN_MAX_AGE_MS =
  30 * 24 * 60 * 60 * 1000;

// 암호학적으로 안전한 난수 토큰 생성
function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

// Refresh Token은 SHA-256 해시로 변환해서 저장합니다.
// 원본 토큰을 데이터베이스에 저장하지 않습니다.
function hashRefreshToken(token: string): string {
  return crypto
    .createHash("sha256")
    .update(token, "utf8")
    .digest("hex");
}

// 회원의 새로운 인증 세션 생성
async function createSession(userId: string, expectedTokenVersion: number) {
  const refreshToken = generateRefreshToken();

  const tokenHash = hashRefreshToken(refreshToken);

  const expiresAt = new Date(
    Date.now() + REFRESH_TOKEN_MAX_AGE_MS
  );

  const created = await authRepository.createSession({
    userId, expectedTokenVersion,
    tokenHash,
    expiresAt
  });

  const accessToken = createAccessToken(
    userId,
    created.tokenVersion
  );

  return {
    accessToken,
    refreshToken,
    expiresAt
  };
}

// 인증 비즈니스 로직
export const authService = {

  // 회원가입
  async register(input: RegisterInput) {

    // 이메일 중복 검사
    const existing = await authRepository.findByEmail(
      input.email
    );

    if (existing) {
      throw new AppError(
        409,
        "EMAIL_ALREADY_EXISTS",
        "이미 가입된 이메일 주소입니다."
      );
    }

    // bcrypt 단방향 해싱
    const passwordHash = await bcrypt.hash(
      input.password,
      BCRYPT_ROUNDS
    );

    // 최초 Refresh Token을 안전한 난수로 생성합니다.
    const refreshToken = generateRefreshToken();

    const tokenHash = hashRefreshToken(
      refreshToken
    );

    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_MAX_AGE_MS
    );

    // 회원과 최초 세션을 하나의 트랜잭션으로 저장합니다.
    //
    // 어느 한쪽이라도 실패하면 전체 작업이 취소됩니다.
    const user = await authRepository.createUserWithSession({

      email: input.email,

      passwordHash,

      name: input.name,

      tokenHash,

      expiresAt

    });

    // DB 트랜잭션이 성공한 이후 Access Token을 발급합니다.
    const accessToken = createAccessToken(
      user.id,
      0
    );

    return {
      user,
      accessToken,
      refreshToken,
      expiresAt
    };
  },

  // 로그인
  async login(input: LoginInput) {

    const user = await authRepository.findByEmail(
      input.email
    );

    // 존재하지 않는 계정과 비밀번호 오류를
    // 동일한 메시지로 처리합니다.
    if (!user) {
      await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);
      throw new AppError(
        401,
        "INVALID_CREDENTIALS",
        "이메일 또는 비밀번호가 올바르지 않습니다."
      );
    }

    const passwordMatches = await bcrypt.compare(
      input.password,
      user.passwordHash
    );

    if (!passwordMatches) {
      await authRepository.recordFailedLogin(user.id);
      throw new AppError(
        401,
        "INVALID_CREDENTIALS",
        "이메일 또는 비밀번호가 올바르지 않습니다."
      );
    }

    if (user.suspendedAt || user.deletedAt || (user.lockedUntil && user.lockedUntil > new Date())) throw new AppError(401, "INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다.");
    if (user.mfaEnabled) {
      try { await verifyMfa(user.id, input.mfaCode ?? ""); }
      catch (error) {
        if (error instanceof AppError && error.errorCode === "INVALID_MFA") await authRepository.recordFailedLogin(user.id);
        throw error;
      }
    }
    await authRepository.recordSuccessfulLogin(user.id);

    const tokens = await createSession(
      user.id, user.tokenVersion
    );

    const publicUser = await authRepository.findPublicUser(
      user.id
    );

    if (!publicUser) {
      throw new AppError(
        401,
        "USER_NOT_FOUND",
        "회원 정보를 찾을 수 없습니다."
      );
    }

    return {
      user: publicUser,
      ...tokens
    };
  },

  // Refresh Token 갱신
  async refresh(refreshToken: string) {

    const tokenHash = hashRefreshToken(refreshToken);

    // DB에 저장된 세션 검색
    const session = await authRepository.findSession(
      tokenHash
    );

    if (session?.revokedAt) {
      await authRepository.revokeAllSessions(session.userId);
      throw new AppError(401, "REFRESH_TOKEN_REUSED", "토큰 재사용이 감지되어 모든 세션을 종료했습니다.");
    }
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    ) {
      throw new AppError(
        401,
        "INVALID_REFRESH_TOKEN",
        "로그인 세션이 만료되었거나 유효하지 않습니다."
      );
    }

    // 새로운 Refresh Token 발급
    const newRefreshToken = generateRefreshToken();

    const newTokenHash = hashRefreshToken(
      newRefreshToken
    );

    const newExpiresAt = new Date(
      Date.now() + REFRESH_TOKEN_MAX_AGE_MS
    );

    // 기존 토큰을 폐기하고 새 토큰으로 교체
    const rotated = await authRepository.rotateSession({
      oldSessionId: session.id,
      userId: session.userId,
      newTokenHash,
      newExpiresAt
    }).catch(async (error) => {
      if (error instanceof AppError && error.errorCode === "REFRESH_TOKEN_REUSED") await authRepository.revokeAllSessions(session.userId);
      throw error;
    });

    // 새로운 Access Token 발급
    const accessToken = createAccessToken(
      session.userId,
      rotated.tokenVersion
    );

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresAt: newExpiresAt
    };
  },

  // 현재 기기 로그아웃
  async logout(refreshToken: string) {

    const tokenHash = hashRefreshToken(refreshToken);

    await authRepository.revokeSession(
      tokenHash
    );

    return {
      loggedOut: true
    };
  },

  // 전체 기기 로그아웃
  async logoutAll(userId: string) {

    await authRepository.revokeAllSessions(
      userId
    );

    return {
      loggedOut: true
    };
  },

  // 내 정보 조회
  async getMe(userId: string) {

    const user = await authRepository.findPublicUser(
      userId
    );

    if (!user) {
      throw new AppError(
        404,
        "USER_NOT_FOUND",
        "회원 정보를 찾을 수 없습니다."
      );
    }

    return user;
  }
};

