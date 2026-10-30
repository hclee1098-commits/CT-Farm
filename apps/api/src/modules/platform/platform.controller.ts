import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "../../infrastructure/prisma";
import { requireAuth } from "../../common/auth.middleware";
import { asyncHandler, validate, uuidSchema } from "../../common/validate";
import { success } from "../../common/response";
import { AppError } from "../../common/app-error";
import { sensitiveLimiter } from "../../infrastructure/rate-limit";
import { passwordSchema, emailSchema } from "../auth/auth.dto";
import { verifyMfa, base32, seal, unseal, matchingStep, recoveryHash } from "../auth/mfa";
import { requestEmailChange, reauthenticate, requestAccountAction, consumeAccountAction } from "./account.service";

const sensitive = z.object({ password: z.string().min(1).max(128), mfaCode: z.string().max(32).optional() }).strict();
const id = (req: Express.Request) => (req.validated?.params as { id: string }).id;
export const accountRouter = Router();
accountRouter.use(sensitiveLimiter);
accountRouter.post("/email/request", validate("body", z.object({ email: emailSchema, kind: z.enum(["VERIFY", "RESET"]) }).strict()), asyncHandler(async (req, res) => {
  success(res, await requestAccountAction(req.body.email, req.body.kind));
}));
accountRouter.post("/email/verify", validate("body", z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict()), asyncHandler(async (req, res) => {
  success(res, await consumeAccountAction(req.body.token, "VERIFY"));
}));
accountRouter.post("/password/reset", validate("body", z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), newPassword: passwordSchema }).strict()), asyncHandler(async (req, res) => {
  success(res, await consumeAccountAction(req.body.token, "RESET", req.body.newPassword));
}));
accountRouter.post("/email/change/confirm", validate("body", z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict()), asyncHandler(async (req, res) => {
  success(res, await consumeAccountAction(req.body.token, "CHANGE_EMAIL"));
}));
accountRouter.post("/recover", validate("body", z.object({ email: emailSchema, password: z.string().min(1).max(128), mfaCode: z.string().max(32).optional() }).strict()), asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { email: req.body.email } });
  const dummy = "$2b$12$g4wFEEJsIg5CJmbHOq5LGumor7tYhSjid3/8oyFgQ3aMZs/vhmKTu";
  const matches = await bcrypt.compare(req.body.password, user?.passwordHash ?? dummy);
  if (!user || !matches || !user.deletedAt || user.deletedAt.getTime() < Date.now() - 30 * 86400000 || user.suspendedAt || user.role !== "USER" || (user.lockedUntil && user.lockedUntil > new Date())) throw new AppError(401, "RECOVERY_DENIED", "계정 복구 조건을 확인해 주세요.");
  if (user.mfaEnabled) await verifyMfa(user.id, req.body.mfaCode ?? "");
  await prisma.$transaction(async tx => {
    const updated = await tx.user.updateMany({ where: { id: user.id, deletedAt: user.deletedAt, tokenVersion: user.tokenVersion, suspendedAt: null }, data: { deletedAt: null, tokenVersion: { increment: 1 } } });
    if (updated.count !== 1) throw new AppError(409, "ACCOUNT_CHANGED", "계정 상태가 변경되었습니다.");
    await tx.auditEvent.create({ data: { actorId: user.id, action: "ACCOUNT_RECOVERED" } });
  });
  success(res, { recovered: true, loginRequired: true });
}));
accountRouter.use(requireAuth);
accountRouter.post("/email/change", validate("body", sensitive.extend({ email: emailSchema })), asyncHandler(async (req, res) => {
  success(res, await requestEmailChange(req.userId!, req.body.password, req.body.email, req.body.mfaCode));
}));
accountRouter.patch("/profile", validate("body", z.object({ name: z.string().trim().min(2).max(60), notificationEmail: z.boolean() }).strict()), asyncHandler(async (req, res) => {
  success(res, await prisma.user.update({ where: { id: req.userId! }, data: req.body, select: { id: true, name: true, notificationEmail: true } }));
}));
accountRouter.post("/password/change", validate("body", sensitive.extend({ newPassword: passwordSchema })), asyncHandler(async (req, res) => {
  const user = await reauthenticate(req.userId!, req.body.password, req.body.mfaCode);
  const hash = await bcrypt.hash(req.body.newPassword, 12);
  await prisma.$transaction(async tx => {
    const changed = await tx.user.updateMany({ where: { id: user.id, passwordHash: user.passwordHash, tokenVersion: user.tokenVersion, deletedAt: null, suspendedAt: null }, data: { passwordHash: hash, tokenVersion: { increment: 1 } } });
    if (changed.count !== 1) throw new AppError(409, "ACCOUNT_CHANGED", "계정 상태가 변경되었습니다. 다시 로그인해 주세요.");
    await tx.refreshSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.auditEvent.create({ data: { actorId: user.id, action: "PASSWORD_CHANGED" } });
  });
  success(res, { changed: true, loginRequired: true });
}));
accountRouter.post("/withdraw", validate("body", sensitive), asyncHandler(async (req, res) => {
  const user = await reauthenticate(req.userId!, req.body.password, req.body.mfaCode);
  await prisma.$transaction(async tx => {
    const changed = await tx.user.updateMany({ where: { id: user.id, tokenVersion: user.tokenVersion, role: "USER", deletedAt: null }, data: { deletedAt: new Date(), tokenVersion: { increment: 1 } } });
    if (changed.count !== 1) throw new AppError(409, "WITHDRAW_BLOCKED", "관리자 계정은 역할을 변경한 후 탈퇴해야 합니다.");
    await tx.refreshSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.auditEvent.create({ data: { actorId: user.id, action: "ACCOUNT_WITHDRAWN" } });
  });
  success(res, { withdrawn: true, dataRetained: true });
}));
accountRouter.get("/export", asyncHandler(async (req, res) => {
  // 메모리 고갈을 막기 위해 각 범주를 제한합니다. 대용량 내보내기는 별도 작업이 필요합니다.
  const userId = req.userId!;
  const [profile, notes, files, farms, diary, farmRecords, products, orders, consultations, testPayments, farmMemberships] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, createdAt: true } }),
    prisma.note.findMany({ where: { ownerId: userId }, take: 1000, select: { id: true, title: true, content: true, deletedAt: true } }),
    prisma.storedFile.findMany({ where: { ownerId: userId }, take: 1000, select: { id: true, originalName: true, size: true, sha256: true } }),
    prisma.farm.findMany({where:{ownerId:userId},take:1000}),
    prisma.farmDiary.findMany({where:{farm:{ownerId:userId}},take:1000}),
    prisma.farmRecord.findMany({where:{farm:{ownerId:userId}},take:1000}),
    prisma.farmProduct.findMany({where:{farm:{ownerId:userId}},take:1000}),
    prisma.farmOrder.findMany({where:{product:{farm:{ownerId:userId}}},take:1000}),
    prisma.farmConsultation.findMany({where:{farm:{ownerId:userId}},take:1000,select:{id:true,farmId:true,question:true,answer:true,status:true,mode:true,sources:true,usageTokens:true,createdAt:true}}),
    prisma.farmPayment.findMany({where:{order:{product:{farm:{ownerId:userId}}}},take:1000,select:{id:true,orderId:true,amountWon:true,status:true,provider:true,createdAt:true,updatedAt:true}}),
    prisma.farmMember.findMany({where:{userId},take:1000,select:{id:true,farmId:true,role:true,revokedAt:true,createdAt:true}})
  ]);
  const farmInvitations=await prisma.farmInvitation.findMany({where:{OR:[{farm:{ownerId:userId}},{email:profile?.email.toLowerCase()||''}]},take:1000,select:{id:true,farmId:true,email:true,expiresAt:true,usedAt:true,revokedAt:true,createdAt:true}});
  success(res, { profile, notes, files, farms, diary, farmRecords, products, orders, consultations, testPayments, farmMemberships, farmInvitations, limitPerCategory: 1000 });
}));
accountRouter.get("/sessions", asyncHandler(async (req, res) => {
  success(res, await prisma.refreshSession.findMany({ where: { userId: req.userId!, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, createdAt: true, expiresAt: true }, orderBy: { createdAt: "desc" }, take: 100 }));
}));
accountRouter.delete("/sessions/:id", validate("params", uuidSchema), asyncHandler(async (req, res) => {
  await prisma.$transaction(async tx => {
    // Access Token은 세션 ID를 담지 않는 V5 형식이므로 즉시 무효화를 위해 전역 버전도 증가합니다.
    await tx.user.update({ where: { id: req.userId! }, data: { tokenVersion: { increment: 1 } } });
    const changed = await tx.refreshSession.updateMany({ where: { id: id(req), userId: req.userId!, revokedAt: null }, data: { revokedAt: new Date() } });
    if (changed.count !== 1) throw new AppError(404, "SESSION_NOT_FOUND", "세션을 찾을 수 없습니다.");
    await tx.auditEvent.create({ data: { actorId: req.userId!, action: "SESSION_REVOKED", targetId: id(req) } });
  });
  success(res, { revoked: true, accessTokensInvalidated: true });
}));
accountRouter.get("/history", asyncHandler(async (req, res) => {
  success(res, await prisma.auditEvent.findMany({ where: { actorId: req.userId! }, orderBy: { createdAt: "desc" }, take: 100 }));
}));
accountRouter.post("/mfa/setup", validate("body", sensitive), asyncHandler(async (req, res) => {
  const user = await reauthenticate(req.userId!, req.body.password, req.body.mfaCode);
  if (user.mfaEnabled) throw new AppError(409, "MFA_ENABLED", "이미 MFA가 등록되어 있습니다.");
  const secret = crypto.randomBytes(20);
  const changed = await prisma.user.updateMany({ where: { id: user.id, mfaEnabled: false, passwordHash: user.passwordHash, tokenVersion: user.tokenVersion }, data: { mfaSecret: seal(secret, user.id), mfaLastStep: -1, mfaSetupExpiresAt: new Date(Date.now() + 10 * 60000) } });
  if (changed.count !== 1) throw new AppError(409, "ACCOUNT_CHANGED", "계정 상태가 변경되었습니다.");
  success(res, { secret: base32(secret), uri: `otpauth://totp/SECURE%20STARTER:${encodeURIComponent(user.email)}?secret=${base32(secret)}&issuer=SECURE%20STARTER&digits=6&period=30` });
}));
accountRouter.post("/mfa/enable", validate("body", z.object({ code: z.string().regex(/^\d{6}$/) }).strict()), asyncHandler(async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } });
  if (!user.mfaSecret || user.mfaEnabled || !user.mfaSetupExpiresAt || user.mfaSetupExpiresAt <= new Date()) throw new AppError(409, "MFA_SETUP_REQUIRED", "MFA 등록을 먼저 시작해 주세요.");
  const step = matchingStep(unseal(user.mfaSecret, user.id), req.body.code);
  if (step === null) throw new AppError(401, "INVALID_MFA", "인증 코드를 확인해 주세요.");
  const codes = Array.from({ length: 10 }, () => crypto.randomBytes(16).toString("hex"));
  await prisma.$transaction(async tx => {
    const changed = await tx.user.updateMany({ where: { id: user.id, mfaEnabled: false, mfaSecret: user.mfaSecret, tokenVersion: user.tokenVersion }, data: { mfaEnabled: true, mfaSetupExpiresAt: null, mfaLastStep: BigInt(step), recoveryHashes: codes.map(recoveryHash), tokenVersion: { increment: 1 } } });
    if (changed.count !== 1) throw new AppError(409, "MFA_CHANGED", "MFA 상태가 변경되었습니다.");
    await tx.refreshSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.auditEvent.create({ data: { actorId: user.id, action: "MFA_ENABLED" } });
  });
  success(res, { recoveryCodes: codes, loginRequired: true });
}));
accountRouter.post("/mfa/disable", validate("body", sensitive), asyncHandler(async (req, res) => {
  const user = await reauthenticate(req.userId!, req.body.password, req.body.mfaCode);
  if (user.role === "ADMIN") throw new AppError(403, "ADMIN_MFA_REQUIRED", "관리자는 MFA를 해제할 수 없습니다.");
  await prisma.$transaction(async tx => {
    const changed = await tx.user.updateMany({ where: { id: user.id, role: "USER", tokenVersion: user.tokenVersion }, data: { mfaEnabled: false, mfaSecret: null, mfaSetupExpiresAt: null, recoveryHashes: [], mfaLastStep: -1, tokenVersion: { increment: 1 } } });
    if (changed.count !== 1) throw new AppError(409, "ACCOUNT_CHANGED", "계정 상태가 변경되었습니다.");
    await tx.refreshSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.auditEvent.create({ data: { actorId: user.id, action: "MFA_DISABLED" } });
  });
  success(res, { disabled: true, loginRequired: true });
}));

export const notificationRouter = Router();
notificationRouter.use(requireAuth);
notificationRouter.get("/", asyncHandler(async (req, res) => {
  success(res, await prisma.notification.findMany({ where: { userId: req.userId! }, orderBy: { createdAt: "desc" }, take: 100 }));
}));
notificationRouter.patch("/:id/read", validate("params", uuidSchema), asyncHandler(async (req, res) => {
  const changed = await prisma.notification.updateMany({ where: { id: id(req), userId: req.userId! }, data: { readAt: new Date() } });
  if (changed.count !== 1) throw new AppError(404, "NOTIFICATION_NOT_FOUND", "알림을 찾을 수 없습니다.");
  success(res, { read: true });
}));
