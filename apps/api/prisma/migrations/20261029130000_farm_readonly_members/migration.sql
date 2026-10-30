-- 기존 테이블·열·데이터를 변경하지 않는 읽기 전용 협업 확장
CREATE TABLE "FarmMember" (
 "id" TEXT PRIMARY KEY, "farmId" TEXT NOT NULL REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "role" VARCHAR(16) NOT NULL DEFAULT 'VIEWER' CHECK ("role" = 'VIEWER'),
 "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "FarmMember_farmId_userId_key" ON "FarmMember"("farmId","userId");
CREATE INDEX "FarmMember_userId_revokedAt_idx" ON "FarmMember"("userId","revokedAt");
CREATE TABLE "FarmInvitation" (
 "id" TEXT PRIMARY KEY, "farmId" TEXT NOT NULL REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "email" VARCHAR(254) NOT NULL, "tokenHash" TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "FarmInvitation_tokenHash_key" ON "FarmInvitation"("tokenHash");
CREATE INDEX "FarmInvitation_farmId_createdAt_idx" ON "FarmInvitation"("farmId","createdAt");
