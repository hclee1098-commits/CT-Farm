// filepath: apps/api/src/modules/auth/auth.repository.ts - Prisma를 이용한 회원과 인증 세션 데이터 접근
import { prisma } from "../../infrastructure/prisma";
import { AppError } from "../../common/app-error";

// 외부에 노출해도 되는 회원 필드
export const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true, mfaEnabled: true, emailVerifiedAt: true, notificationEmail: true,
  createdAt: true,
  updatedAt: true,
} as const;

// 데이터베이스 접근 로직을 한곳에서 관리합니다.
export const authRepository = {
  // 조건부 SQL 한 번으로 분산 요청에서도 로그인 실패 횟수를 원자적으로 갱신합니다.
  async recordFailedLogin(userId: string) {
    await prisma.$executeRaw`
      UPDATE "User" SET
        "failedLoginCount" = CASE WHEN "lockedUntil" IS NOT NULL AND "lockedUntil" <= NOW() THEN 1 ELSE "failedLoginCount" + 1 END,
        "lockedUntil" = CASE WHEN "failedLoginCount" + 1 >= 5 AND ("lockedUntil" IS NULL OR "lockedUntil" > NOW()) THEN NOW() + INTERVAL '15 minutes' ELSE NULL END
      WHERE "id" = ${userId}
    `;
  },
  async recordSuccessfulLogin(userId: string) {
    await prisma.$transaction(async tx => {
      const changed = await tx.user.updateMany({ where: { id: userId, deletedAt: null, suspendedAt: null, OR: [{ lockedUntil: null }, { lockedUntil: { lte: new Date() } }] }, data: { failedLoginCount: 0, lockedUntil: null } });
      if (changed.count !== 1) throw new AppError(401, "INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다.");
      await tx.auditEvent.create({ data: { actorId: userId, action: "LOGIN_SUCCEEDED" } });
    });
  },
  // 이메일로 회원 검색
  findByEmail(email: string) {
    return prisma.user.findUnique({
      where: {
        email,
      },
    });
  },

  // 회원 ID로 회원 검색
  findById(id: string) {
    return prisma.user.findUnique({
      where: {
        id,
      },
    });
  },

  // 외부 응답용 회원 정보 조회
  findPublicUser(id: string) {
    return prisma.user.findUnique({
      where: {
        id,
      },
      select: publicUserSelect,
    });
  },

  // 회원 생성
  createUser(data: { email: string; passwordHash: string; name: string }) {
    return prisma.user.create({
      data,
      select: publicUserSelect,
    });
  },
  // 회원과 최초 인증 세션을 하나의 트랜잭션으로 생성합니다.
  //
  // 세션 저장에 실패하면 회원 생성도 취소됩니다.
  async createUserWithSession(data: {
    email: string;
    passwordHash: string;
    name: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash: data.passwordHash,
          name: data.name,
        },

        select: publicUserSelect,
      });

      await tx.refreshSession.create({
        data: {
          userId: user.id,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
        },
      });

      return user;
    });
  },

  // Refresh Token 세션 생성
  // 전체 로그아웃과 로그인 요청의 동시 실행을 보호합니다.
  async createSession(data: {
    expectedTokenVersion?: number;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return prisma.$transaction(async (tx) => {
      // 회원 행을 잠가 전체 로그아웃과 실행 순서를 조정합니다.
      const users = await tx.$queryRaw<Array<{ tokenVersion: number; suspendedAt?: Date; deletedAt?: Date }>>`
        SELECT "tokenVersion", "suspendedAt", "deletedAt"
        FROM "User"
        WHERE "id" = ${data.userId}
        FOR UPDATE
      `;

      // 회원이 삭제되었거나 존재하지 않으면 중단합니다.
      const user = users[0];

      if (users.length !== 1 || !user || user.suspendedAt || user.deletedAt) {
        throw new AppError(
          401,
          "USER_NOT_FOUND",
          "회원 정보를 찾을 수 없습니다.",
        );
      }

      if (data.expectedTokenVersion !== undefined && data.expectedTokenVersion !== user.tokenVersion) {
        throw new AppError(401, "CREDENTIALS_CHANGED", "인증 도중 계정 상태가 변경되었습니다. 다시 로그인하세요.");
      }
      // 잠금을 유지한 상태에서 인증 세션을 생성합니다.
      const session = await tx.refreshSession.create({
        data: {
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
        },
      });

      // 실제 세션 생성 시점의 토큰 버전을 반환합니다.
      return {
        session,
        tokenVersion: user.tokenVersion,
      };
    });
  },

  // Refresh Token 해시로 세션 조회
  findSession(tokenHash: string) {
    return prisma.refreshSession.findUnique({
      where: {
        tokenHash,
      },
      include: {
        user: {
          select: {
            id: true,
            tokenVersion: true,
          },
        },
      },
    });
  },

  // Refresh Token을 원자적으로 교체합니다.
  // 동시에 같은 토큰으로 갱신 요청이 들어와도
  // 하나의 요청만 성공하도록 처리합니다.
  async rotateSession(data: {
    oldSessionId: string;
    userId: string;
    newTokenHash: string;
    newExpiresAt: Date;
  }) {
    return prisma.$transaction(async (tx) => {
      const now = new Date();

      // 전체 로그아웃과 동일한 회원 행을 먼저 잠급니다.
      const users = await tx.$queryRaw<Array<{ tokenVersion: number; suspendedAt?: Date; deletedAt?: Date }>>`
        SELECT "tokenVersion", "suspendedAt", "deletedAt"
        FROM "User"
        WHERE "id" = ${data.userId}
        FOR UPDATE
      `;

      const user = users[0];

      if (users.length !== 1 || !user || user.suspendedAt || user.deletedAt) {
        throw new AppError(
          401,
          "INVALID_REFRESH_TOKEN",
          "유효하지 않은 인증 토큰입니다.",
        );
      }

      // 기존 세션을 사용 불가능한 상태로 변경
      const updated = await tx.refreshSession.updateMany({
        where: {
          id: data.oldSessionId,
          userId: data.userId,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        data: {
          revokedAt: now,
        },
      });

      // 이미 사용되었거나 만료된 토큰
      if (updated.count !== 1) {
        throw new AppError(
          401,
          "REFRESH_TOKEN_REUSED",
          "이미 사용되었거나 만료된 인증 토큰입니다.",
        );
      }

      // 잠금을 유지한 상태에서 새로운 세션을 생성합니다.
      const session = await tx.refreshSession.create({
        data: {
          userId: data.userId,
          tokenHash: data.newTokenHash,
          expiresAt: data.newExpiresAt,
        },
      });

      return {
        session,
        tokenVersion: user.tokenVersion,
      };
    });
  },

  // 특정 Refresh Token 세션 종료
  async revokeSession(tokenHash: string) {
    const session = await prisma.refreshSession.findUnique({ where: { tokenHash } });
    if (!session) return { count: 0 };
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${session.userId} FOR UPDATE`;
      const result = await tx.refreshSession.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } });
      if (result.count === 1) await tx.user.update({ where: { id: session.userId }, data: { tokenVersion: { increment: 1 } } });
      return result;
    });
  },

  // 회원의 모든 세션 종료
  // Access Token도 무효화합니다.
  async revokeAllSessions(userId: string) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          tokenVersion: {
            increment: 1,
          },
        },
      });

      await tx.refreshSession.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      return user;
    });
  },
};


