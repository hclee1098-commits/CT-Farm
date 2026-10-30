-- 기존 데이터에는 손대지 않고 농장 운영 모델을 추가합니다.
CREATE TABLE "FarmRecord" (
 "id" TEXT PRIMARY KEY, "farmId" TEXT NOT NULL, "kind" VARCHAR(16) NOT NULL, "data" JSONB NOT NULL,
 "version" INTEGER NOT NULL DEFAULT 1, "deletedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "FarmRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "FarmRecord_kind_check" CHECK ("kind" IN ('PLOT','CROP','TASK','LEDGER','HARVEST')),
 CONSTRAINT "FarmRecord_data_check" CHECK (jsonb_typeof("data")='object'),
 CONSTRAINT "FarmRecord_version_check" CHECK ("version">0)
);
CREATE INDEX "FarmRecord_farmId_kind_createdAt_idx" ON "FarmRecord"("farmId","kind","createdAt");
CREATE TABLE "DiaryPhoto" (
 "id" TEXT PRIMARY KEY, "diaryId" TEXT NOT NULL, "fileId" TEXT NOT NULL, "caption" VARCHAR(200) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "DiaryPhoto_diaryId_fkey" FOREIGN KEY ("diaryId") REFERENCES "FarmDiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "DiaryPhoto_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DiaryPhoto_diaryId_fileId_key" ON "DiaryPhoto"("diaryId","fileId");
CREATE TABLE "FarmSensor" (
 "id" TEXT PRIMARY KEY, "farmId" TEXT NOT NULL, "name" VARCHAR(100) NOT NULL, "kind" VARCHAR(20) NOT NULL,
 "minValue" DOUBLE PRECISION NOT NULL, "maxValue" DOUBLE PRECISION NOT NULL, "staleMinutes" INTEGER NOT NULL DEFAULT 60,
 "tokenHash" VARCHAR(64) NOT NULL, "simulated" BOOLEAN NOT NULL DEFAULT false, "revokedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "FarmSensor_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "FarmSensor_kind_check" CHECK ("kind" IN ('MOISTURE','TEMPERATURE','HUMIDITY')),
 CONSTRAINT "FarmSensor_range_check" CHECK ("minValue" < "maxValue" AND "minValue">= -80 AND "maxValue"<=100 AND ("kind"='TEMPERATURE' OR "minValue">=0)),
 CONSTRAINT "FarmSensor_stale_check" CHECK ("staleMinutes" BETWEEN 1 AND 10080)
);
CREATE UNIQUE INDEX "FarmSensor_tokenHash_key" ON "FarmSensor"("tokenHash");
CREATE INDEX "FarmSensor_farmId_createdAt_idx" ON "FarmSensor"("farmId","createdAt");
CREATE TABLE "SensorReading" (
 "id" TEXT PRIMARY KEY, "sensorId" TEXT NOT NULL, "sampleId" VARCHAR(80) NOT NULL, "value" DOUBLE PRECISION NOT NULL,
 "measuredAt" TIMESTAMP(3) NOT NULL, "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "SensorReading_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "FarmSensor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "SensorReading_value_check" CHECK ("value">= -80 AND "value"<=100)
);
CREATE UNIQUE INDEX "SensorReading_sensorId_sampleId_key" ON "SensorReading"("sensorId","sampleId");
CREATE INDEX "SensorReading_sensorId_measuredAt_idx" ON "SensorReading"("sensorId","measuredAt");
CREATE TABLE "FarmProduct" (
 "id" TEXT PRIMARY KEY, "farmId" TEXT NOT NULL, "name" VARCHAR(120) NOT NULL, "unit" VARCHAR(40) NOT NULL,
 "priceWon" INTEGER NOT NULL, "stock" INTEGER NOT NULL, "version" INTEGER NOT NULL DEFAULT 1, "archivedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "FarmProduct_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "FarmProduct_amount_check" CHECK ("priceWon">0 AND "stock">=0 AND "version">0)
);
CREATE INDEX "FarmProduct_farmId_createdAt_idx" ON "FarmProduct"("farmId","createdAt");
CREATE TABLE "FarmOrder" (
 "id" TEXT PRIMARY KEY, "productId" TEXT NOT NULL, "requestKey" VARCHAR(80) NOT NULL, "buyerLabel" VARCHAR(80) NOT NULL,
 "quantity" INTEGER NOT NULL, "totalWon" INTEGER NOT NULL, "status" VARCHAR(16) NOT NULL DEFAULT 'RESERVED',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "FarmOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "FarmProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "FarmOrder_values_check" CHECK ("quantity">0 AND "totalWon">0 AND "status" IN ('RESERVED','COMPLETED','CANCELLED'))
);
CREATE UNIQUE INDEX "FarmOrder_productId_requestKey_key" ON "FarmOrder"("productId","requestKey");
