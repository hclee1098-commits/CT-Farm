// 서버와 같은 환경 설정을 읽습니다. 기존 회원의 MFA 등록 후 한 번만 실행합니다.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function run() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error("BOOTSTRAP_ADMIN_EMAIL을 설정하세요.");
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(613006)`;
    if (await tx.user.count({ where: { role: "ADMIN" } })) throw new Error("관리자가 이미 존재합니다. 관리자 API를 사용하세요.");
    const user = await tx.user.findUnique({ where: { email } });
    if (!user || !user.mfaEnabled || user.suspendedAt || user.deletedAt) throw new Error("MFA를 등록한 활성 회원만 최초 관리자로 지정할 수 있습니다.");
    await tx.user.update({ where: { id: user.id }, data: { role: "ADMIN", tokenVersion: { increment: 1 } } });
    await tx.refreshSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.auditEvent.create({ data: { actorId: user.id, targetId: user.id, action: "ADMIN_BOOTSTRAPPED" } });
  });
  console.log("최초 관리자 지정 완료. MFA로 다시 로그인하세요.");
}
run().catch((error) => { console.error("오류 분류:", error?.name, error?.code, error?.meta?.code); console.error("최초 관리자 지정 실패. 대상 계정, MFA 등록 및 기존 관리자 여부를 확인하세요."); process.exitCode = 1; }).finally(() => db.$disconnect());
