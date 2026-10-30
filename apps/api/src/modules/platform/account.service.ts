import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { prisma } from "../../infrastructure/prisma";
import { AppError } from "../../common/app-error";
import { verifyMfa, recoveryHash } from "../auth/mfa";
import { getMailTransport } from "./mail";

export async function reauthenticate(userId: string, password: string, code?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt || user.suspendedAt || !await bcrypt.compare(password, user.passwordHash)) {
    throw new AppError(401, "REAUTH_REQUIRED", "현재 비밀번호를 확인해 주세요.");
  }
  if (user.mfaEnabled) await verifyMfa(user.id, code ?? "");
  return user;
}
export async function requestAccountAction(email: string, kind: "VERIFY" | "RESET") {
  // 구성 오류는 존재하는 계정과 없는 계정 모두 동일하게 반환합니다.
  const mail = getMailTransport();
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.deletedAt && !user.suspendedAt) {
    const token = crypto.randomBytes(32).toString("hex");
    const action = await prisma.accountAction.create({ data: {
      userId: user.id, kind, issuedVersion: user.tokenVersion, tokenHash: recoveryHash(token), expiresAt: new Date(Date.now() + 15 * 60000)
    } });
    try { await mail.send({ to: email, kind, token }); }
    catch {
      await prisma.accountAction.update({ where: { id: action.id }, data: { consumedAt: new Date() } });
      throw new AppError(503, "MAIL_DELIVERY_FAILED", "이메일 발송을 완료하지 못했습니다.");
    }
  }
  return { accepted: true };
}
export async function consumeAccountAction(token: string, kind: "VERIFY" | "RESET" | "CHANGE_EMAIL", password?: string) {
  const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;
  return prisma.$transaction(async tx => {
    const action = await tx.accountAction.findUnique({ where: { tokenHash: recoveryHash(token) } });
    if (!action || action.kind !== kind) throw new AppError(400, "INVALID_ACTION_TOKEN", "인증 링크가 유효하지 않습니다.");
    // 인증 관련 변경은 회원 행 잠금 순서를 통일합니다.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${action.userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: action.userId } });
    if (user.deletedAt || user.suspendedAt || user.tokenVersion !== action.issuedVersion) throw new AppError(400, "INVALID_ACTION_TOKEN", "인증 링크가 유효하지 않습니다.");
    const consumed = await tx.accountAction.updateMany({ where: { id: action.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
    if (consumed.count !== 1) throw new AppError(400, "INVALID_ACTION_TOKEN", "인증 링크가 만료되었거나 이미 사용되었습니다.");
    await tx.user.update({ where: { id: user.id }, data: kind === "VERIFY" ? { emailVerifiedAt: new Date() } : kind === "CHANGE_EMAIL" ? { email: action.pendingEmail!, emailVerifiedAt: new Date(), tokenVersion: { increment: 1 } } : { passwordHash, tokenVersion: { increment: 1 } } });
    if (kind === "RESET" || kind === "CHANGE_EMAIL") {
      await tx.refreshSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.accountAction.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: new Date() } });
    }
    // 이메일로 비밀번호를 재설정해도 기존 MFA는 해제하지 않습니다.
    await tx.auditEvent.create({ data: { actorId: user.id, action: `ACCOUNT_${kind}` } });
    return { completed: true };
  });
}

export async function requestEmailChange(userId: string, password: string, email: string, code?: string) {
  const mail = getMailTransport();
  const user = await reauthenticate(userId, password, code);
  const token = crypto.randomBytes(32).toString("hex");
  const action = await prisma.accountAction.create({ data: { userId, kind: "CHANGE_EMAIL", issuedVersion: user.tokenVersion, pendingEmail: email, tokenHash: recoveryHash(token), expiresAt: new Date(Date.now() + 15 * 60000) } });
  try { await mail.send({ to: email, kind: "CHANGE_EMAIL", token }); }
  catch {
    await prisma.accountAction.update({ where: { id: action.id }, data: { consumedAt: new Date() } });
    throw new AppError(503, "MAIL_DELIVERY_FAILED", "이메일 발송을 완료하지 못했습니다.");
  }
  return { accepted: true };
}
