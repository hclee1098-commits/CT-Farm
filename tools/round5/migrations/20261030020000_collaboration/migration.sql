-- 승인 대기 새 migration. 기존 migration을 수정하지 않습니다.
-- 자동 deploy 대상에서 분리: 복구 증거/승인 후 Prisma 스키마와 함께 정식 등록합니다.
ALTER TABLE "FarmMember" DROP CONSTRAINT "FarmMember_role_check";
ALTER TABLE "FarmMember" ADD CONSTRAINT "FarmMember_role_check" CHECK (role IN ('ADMIN','WORKER','VIEWER'));
-- 과거 기록의 작성자를 소유자로 추정해 채우지 않습니다. NULL은 WORKER 수정 불가입니다.
ALTER TABLE "FarmDiary" ADD COLUMN "createdById" TEXT REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "FarmDiary_createdById_idx" ON "FarmDiary"("createdById");
