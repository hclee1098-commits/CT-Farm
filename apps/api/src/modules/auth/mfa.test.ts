import { describe, it, expect, vi, beforeEach } from "vitest";
import { base32, totp, matchingStep, seal, unseal, verifyMfa, recoveryHash } from "./mfa";
import { prisma } from "../../infrastructure/prisma";
vi.mock("../../infrastructure/prisma", () => ({ prisma: { user: { findUnique: vi.fn(), updateMany: vi.fn() } } }));
const secret = Buffer.from('12345678901234567890');
beforeEach(() => vi.clearAllMocks());
describe('MFA 보안', () => {
  it('RFC 6238 SHA-1 벡터의 6자리 절삭값을 반환합니다', () => {
    expect(totp(secret, 1)).toBe('287082'); expect(totp(secret, 37037036)).toBe('081804');
  });
  it('Base32 인코딩을 검증합니다', () => { expect(base32(Buffer.from('foo'))).toBe('MZXW6'); });
  it('시간 허용 범위 밖 및 잘못된 코드 형식을 거부합니다', () => {
    expect(matchingStep(secret, '287082', 59000)).toBe(1);
    expect(matchingStep(secret, '287082', 300000)).toBeNull(); expect(matchingStep(secret, '28708x')).toBeNull();
  });
  it('사용자에 결합한 암호화로 다른 계정의 비밀키 복사를 거부합니다', () => {
    const encrypted = seal(secret, 'u1'); expect(unseal(encrypted, 'u1')).toEqual(secret);
    expect(() => unseal(encrypted, 'u2')).toThrow(); expect(encrypted).not.toContain(secret.toString());
  });
  it('같은 OTP가 동시에 사용되어도 한 번만 성공합니다', async () => {
    const code = totp(secret, Math.floor(Date.now() / 30000));
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ mfaEnabled: true, mfaSecret: seal(secret, 'u1'), recoveryHashes: [] } as never);
    vi.mocked(prisma.user.updateMany).mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const results = await Promise.allSettled([verifyMfa('u1', code), verifyMfa('u1', code)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(prisma.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ mfaLastStep: { lt: expect.any(BigInt) } }) }));
  });
  it('복구 코드는 해시만 비교하고 사용 후 제거합니다', async () => {
    const code = 'a'.repeat(32), hash = recoveryHash(code);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ mfaEnabled: true, mfaSecret: seal(secret, 'u1'), recoveryHashes: [hash] } as never);
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 });
    await verifyMfa('u1', code);
    expect(prisma.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { recoveryHashes: [] } }));
  });
  it('관리자 재인증은 복구 코드를 허용하지 않습니다', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ mfaEnabled: true, mfaSecret: seal(secret, 'u1'), recoveryHashes: [recoveryHash('a'.repeat(32))] } as never);
    await expect(verifyMfa('u1', 'a'.repeat(32), false)).rejects.toMatchObject({ errorCode: 'INVALID_MFA' });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});
