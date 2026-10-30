import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../infrastructure/prisma";
import { redis, connectRedis } from "../../infrastructure/redis";
import { requireAuth } from "../../common/auth.middleware";
import { asyncHandler, validate, uuidSchema } from "../../common/validate";
import { success } from "../../common/response";
import { AppError } from "../../common/app-error";
import { sensitiveLimiter } from "../../infrastructure/rate-limit";
import { verifyMfa } from "../auth/mfa";
import { env } from "../../config/env";

export const requireAdmin = asyncHandler(async (req, _res, next) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { role: true, mfaEnabled: true, suspendedAt: true, deletedAt: true } });
  if (!user || user.role !== "ADMIN" || !user.mfaEnabled || user.suspendedAt || user.deletedAt) {
    throw new AppError(403, "ADMIN_REQUIRED", "MFA가 등록된 관리자 권한이 필요합니다.");
  }
  // 관리자 API는 요청마다 새로운 TOTP가 필요합니다. 복구 코드는 관리자 재인증에 사용할 수 없습니다.
  const code = req.headers["x-mfa-code"];
  await verifyMfa(req.userId!, typeof code === "string" ? code : "", false);
  next();
});
export const adminRouter = Router();
adminRouter.use(sensitiveLimiter, requireAuth, requireAdmin);
adminRouter.get("/dashboard", asyncHandler(async (_req, res) => {
  const [users, notes, files, events, db, cache] = await Promise.all([
    prisma.user.count(), prisma.note.count({ where: { deletedAt: null } }), prisma.storedFile.aggregate({ _count: true, _sum: { size: true } }),
    prisma.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.$queryRaw`SELECT 1`.then(() => "ready").catch(() => "unavailable"),
    connectRedis().then(() => redis.ping()).then(() => "ready").catch(() => "unavailable")
  ]);
  success(res, { users, notes, files, events, database: db, redis: cache, uptime: Math.floor(process.uptime()), memory: process.memoryUsage().rss, environment: env.NODE_ENV, backup: "CLI 보고서 확인 필요", queue: "미설치" });
}));
adminRouter.get("/users", validate("query", z.object({ search: z.string().trim().max(100).default(""), page: z.coerce.number().int().min(1).max(10000).default(1) }).strict()), asyncHandler(async (req, res) => {
  const query = req.validated!.query as { search: string; page: number };
  const where = { OR: [{ email: { contains: query.search, mode: "insensitive" as const } }, { name: { contains: query.search, mode: "insensitive" as const } }] };
  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({ where, select: { id: true, email: true, name: true, role: true, mfaEnabled: true, suspendedAt: true, deletedAt: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (query.page - 1) * 30, take: 30 }),
    prisma.user.count({ where })
  ]);
  success(res, { items, total, page: query.page, limit: 30 });
}));
adminRouter.get("/audit", asyncHandler(async (_req, res) => {
  success(res, await prisma.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 100 }));
}));
adminRouter.patch("/users/:id", validate("params", uuidSchema), validate("body", z.object({ suspended: z.boolean().optional(), role: z.enum(["USER", "ADMIN"]).optional() }).strict().refine(data => Object.keys(data).length > 0)), asyncHandler(async (req, res) => {
  const targetId = (req.validated!.params as { id: string }).id;
  await prisma.$transaction(async tx => {
    // 역할 변경과 마지막 관리자 보호를 모든 관리자 변경 사이에서 직렬화합니다.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(613006)`;
    const actor = await tx.user.findUniqueOrThrow({ where: { id: req.userId! } });
    if (actor.role !== "ADMIN" || actor.suspendedAt || actor.deletedAt || !actor.mfaEnabled) throw new AppError(403, "ADMIN_REQUIRED", "관리자 상태가 변경되었습니다.");
    const target = await tx.user.findUnique({ where: { id: targetId } });
    if (!target) throw new AppError(404, "USER_NOT_FOUND", "회원을 찾을 수 없습니다.");
    if (target.id === actor.id) throw new AppError(409, "SELF_ADMIN_CHANGE", "자신의 관리자 역할이나 정지 상태는 변경할 수 없습니다.");
    if (req.body.role === "ADMIN" && (!target.mfaEnabled || target.deletedAt || target.suspendedAt)) throw new AppError(409, "ADMIN_MFA_REQUIRED", "활성 계정의 MFA 등록을 먼저 완료해 주세요.");
    await tx.user.update({ where: { id: targetId }, data: { ...(req.body.role ? { role: req.body.role } : {}), ...(req.body.suspended !== undefined ? { suspendedAt: req.body.suspended ? new Date() : null } : {}), tokenVersion: { increment: 1 } } });
    await tx.refreshSession.updateMany({ where: { userId: targetId, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.auditEvent.create({ data: { actorId: actor.id, targetId, action: "ADMIN_USER_CHANGED" } });
    await tx.notification.create({ data: { userId: targetId, title: "계정 상태 변경", message: "관리자가 계정 권한 또는 이용 상태를 변경했습니다." } });
  });
  success(res, { updated: true });
}));
