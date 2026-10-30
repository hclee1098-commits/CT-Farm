import crypto from "node:crypto";
import { env } from "../../config/env";
import { AppError } from "../../common/app-error";
import { prisma } from "../../infrastructure/prisma";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(bytes: Buffer): string {
  let bits = 0, value = 0, result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { result += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
export function totp(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac("sha1", secret).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 15;
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
}
export function matchingStep(secret: Buffer, code: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const step of [current, current - 1, current + 1]) {
    if (crypto.timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code))) return step;
  }
  return null;
}
function key(): Buffer {
  if (!env.MFA_ENCRYPTION_KEY) throw new AppError(503, "MFA_KEY_REQUIRED", "MFA 암호화키 설정이 필요합니다.");
  return Buffer.from(env.MFA_ENCRYPTION_KEY, "hex");
}
export function seal(secret: Buffer, userId: string): string {
  const nonce = crypto.randomBytes(12); const cipher = crypto.createCipheriv("aes-256-gcm", key(), nonce);
  cipher.setAAD(Buffer.from(userId));
  const encrypted = Buffer.concat([cipher.update(secret), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64");
}
export function unseal(value: string, userId: string): Buffer {
  const bytes = Buffer.from(value, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(userId)); decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
}
export const recoveryHash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

// 조건부 UPDATE로 동일 OTP 및 복구 코드의 동시 재사용을 차단합니다.
export async function verifyMfa(userId: string, code: string, allowRecovery = true): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.mfaEnabled || !user.mfaSecret) throw new AppError(403, "MFA_REQUIRED", "MFA 등록이 필요합니다.");
  const step = matchingStep(unseal(user.mfaSecret, userId), code);
  if (step !== null) {
    const updated = await prisma.user.updateMany({ where: { id: userId, mfaEnabled: true, mfaSecret: user.mfaSecret, mfaLastStep: { lt: BigInt(step) } }, data: { mfaLastStep: BigInt(step) } });
    if (updated.count === 1) return;
  } else if (allowRecovery && /^[a-f0-9]{32}$/.test(code)) {
    const hash = recoveryHash(code);
    const updated = await prisma.user.updateMany({ where: { id: userId, mfaEnabled: true, recoveryHashes: { equals: user.recoveryHashes }, AND: { recoveryHashes: { has: hash } } }, data: { recoveryHashes: user.recoveryHashes.filter(item => item !== hash) } });
    if (updated.count === 1) return;
  }
  throw new AppError(401, "INVALID_MFA", "인증 코드가 올바르지 않거나 이미 사용되었습니다.");
}
