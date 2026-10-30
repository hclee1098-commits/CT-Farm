
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import bcrypt from "bcrypt";

import { authService } from "./auth.service";
import { authRepository } from "./auth.repository";

import {
  createAccessToken
} from "../../common/auth.middleware";

vi.mock("./auth.repository", () => ({
  authRepository: {
    findByEmail: vi.fn(),
    recordSuccessfulLogin: vi.fn(),
    recordFailedLogin: vi.fn(),
    revokeAllSessions: vi.fn(),
    createSession: vi.fn(),
    findPublicUser: vi.fn(),
    findSession: vi.fn(),
    rotateSession: vi.fn()
  }
}));

vi.mock("../../common/auth.middleware", () => ({
  createAccessToken: vi.fn(
    (id: string, version: number) =>
      id + ":" + version
  )
}));

vi.mock("bcrypt", () => ({
  default: {
    compare: vi.fn()
  }
}));

describe("인증 토큰 버전 회귀 테스트", () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("로그인은 세션 생성 시점의 토큰 버전을 사용합니다.", async () => {

    vi.mocked(
      authRepository.findByEmail
    ).mockResolvedValue({
      id: "test-user",
      passwordHash: "hash",
      tokenVersion: 2
    } as never);

    vi.mocked(
      bcrypt.compare
    ).mockResolvedValue(true as never);

    vi.mocked(
      authRepository.createSession
    ).mockResolvedValue({
      session: {
        id: "session-1"
      },
      tokenVersion: 5
    } as never);

    vi.mocked(
      authRepository.findPublicUser
    ).mockResolvedValue({
      id: "test-user"
    } as never);

    const result = await authService.login({
      email: "test@example.com",
      password: "StrongPassword123!"
    });

    expect(
      createAccessToken
    ).toHaveBeenCalledWith(
      "test-user",
      5
    );

    expect(result.accessToken).toBe(
      "test-user:5"
    );
  });

  it("Refresh Token 갱신은 트랜잭션의 토큰 버전을 사용합니다.", async () => {

    vi.mocked(
      authRepository.findSession
    ).mockResolvedValue({
      id: "old-session",
      userId: "test-user",
      revokedAt: null,
      expiresAt: new Date(
        Date.now() + 60000
      ),
      user: {
        id: "test-user",
        tokenVersion: 2
      }
    } as never);

    vi.mocked(
      authRepository.rotateSession
    ).mockResolvedValue({
      session: {
        id: "new-session"
      },
      tokenVersion: 6
    } as never);

    const result = await authService.refresh(
      "test-refresh-token"
    );

    expect(
      createAccessToken
    ).toHaveBeenCalledWith(
      "test-user",
      6
    );

    expect(result.accessToken).toBe(
      "test-user:6"
    );
  });

});


it("존재하지 않는 계정도 bcrypt 비교 후 동일한 인증 오류를 반환합니다", async () => {
  vi.mocked(authRepository.findByEmail).mockResolvedValue(null);
  vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
  await expect(authService.login({ email: "missing@example.com", password: "password" }))
    .rejects.toMatchObject({ statusCode: 401, errorCode: "INVALID_CREDENTIALS" });
  expect(bcrypt.compare).toHaveBeenCalledWith("password", expect.stringMatching(/^\$2[aby]\$12\$/));
});

