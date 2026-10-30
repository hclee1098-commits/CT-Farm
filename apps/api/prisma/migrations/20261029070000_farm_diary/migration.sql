-- 기존 테이블과 데이터를 수정하거나 삭제하지 않는 추가 마이그레이션
CREATE TABLE "Farm" (
 "id" TEXT NOT NULL PRIMARY KEY, "ownerId" TEXT NOT NULL,
 "name" VARCHAR(100) NOT NULL, "address" VARCHAR(300) NOT NULL,
 "latitude" DOUBLE PRECISION NOT NULL, "longitude" DOUBLE PRECISION NOT NULL,
 "areaM2" DOUBLE PRECISION NOT NULL, "crop" VARCHAR(80) NOT NULL,
 "variety" VARCHAR(80) NOT NULL, "stage" VARCHAR(20) NOT NULL DEFAULT 'PREPARING',
 "version" INTEGER NOT NULL DEFAULT 1, "deletedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "Farm_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "Farm_coordinates_check" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180),
 CONSTRAINT "Farm_area_check" CHECK ("areaM2" > 0 AND "areaM2" <= 1000000000),
 CONSTRAINT "Farm_stage_check" CHECK ("stage" IN ('PREPARING','SOWING','GROWING','HARVESTING','RESTING')),
 CONSTRAINT "Farm_version_check" CHECK ("version" > 0)
);
CREATE INDEX "Farm_ownerId_createdAt_idx" ON "Farm"("ownerId", "createdAt");
CREATE TABLE "FarmDiary" (
 "id" TEXT NOT NULL PRIMARY KEY, "farmId" TEXT NOT NULL, "workDate" VARCHAR(10) NOT NULL,
 "title" VARCHAR(120) NOT NULL, "content" VARCHAR(5000) NOT NULL,
 "version" INTEGER NOT NULL DEFAULT 1, "deletedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "FarmDiary_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "FarmDiary_version_check" CHECK ("version" > 0)
);
CREATE INDEX "FarmDiary_farmId_workDate_idx" ON "FarmDiary"("farmId", "workDate");
