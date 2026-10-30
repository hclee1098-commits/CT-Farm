
import {
  describe,
  expect,
  it,
  vi
} from "vitest";

import { prisma } from "../../infrastructure/prisma";
import { authRepository } from "./auth.repository";

vi.mock("../../infrastructure/prisma", () => ({
  prisma: {
    $transaction: vi.fn()
  }
}));

describe("Refresh Token 트랜잭션 잠금", () => {

  it("회원 행 잠금 이후 기존 토큰 폐기와 새 세션 생성을 수행합니다.", async () => {

    const calls: string[] = [];

    const tx = {
      $queryRaw: vi.fn(async () => {
        calls.push("lock");

        return [{
          tokenVersion: 7
        }];
      }),

      refreshSession: {
        updateMany: vi.fn(async () => {
          calls.push("revoke");

          return {
            count: 1
          };
        }),

        create: vi.fn(async () => {
          calls.push("create");

          return {
            id: "new-session"
          };
        })
      }
    };

    vi.mocked(
      prisma.$transaction
    ).mockImplementation(
      async (callback: any) => callback(tx)
    );

    const result = await authRepository.rotateSession({
      oldSessionId: "old-session",
      userId: "test-user",
      newTokenHash: "new-hash",
      newExpiresAt: new Date(
        Date.now() + 60000
      )
    });

    expect(calls).toEqual([
      "lock",
      "revoke",
      "create"
    ]);

    expect(result).toEqual({
      session: {
        id: "new-session"
      },
      tokenVersion: 7
    });
  });

  it("회원이 없으면 세션을 변경하지 않습니다.", async () => {

    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),

      refreshSession: {
        updateMany: vi.fn(),
        create: vi.fn()
      }
    };

    vi.mocked(
      prisma.$transaction
    ).mockImplementation(
      async (callback: any) => callback(tx)
    );

    await expect(
      authRepository.rotateSession({
        oldSessionId: "old-session",
        userId: "missing-user",
        newTokenHash: "new-hash",
        newExpiresAt: new Date(
          Date.now() + 60000
        )
      })
    ).rejects.toThrow();

    expect(
      tx.refreshSession.updateMany
    ).not.toHaveBeenCalled();

    expect(
      tx.refreshSession.create
    ).not.toHaveBeenCalled();
  });

});


