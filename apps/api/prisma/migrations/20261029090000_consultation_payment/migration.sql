-- 기존 행을 보존하는 추가 migration. 역방향 DROP/RESET은 수행하지 않습니다.
ALTER TABLE "FarmRecord" ADD COLUMN "provenance" JSONB;
CREATE TABLE "FarmConsultation" (
 "id" TEXT PRIMARY KEY,"farmId" TEXT NOT NULL,"requestKey" VARCHAR(80) NOT NULL,"requestHash" VARCHAR(64) NOT NULL,
 "question" VARCHAR(2000) NOT NULL,"answer" VARCHAR(6000),"mode" VARCHAR(20) NOT NULL,"status" VARCHAR(20) NOT NULL,
 "sources" JSONB NOT NULL,"usageTokens" INTEGER NOT NULL DEFAULT 0,"reservedTokens" INTEGER NOT NULL DEFAULT 0,
 "quotaDay" VARCHAR(10),"errorCode" VARCHAR(60),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "FarmConsultation_farmId_fkey" FOREIGN KEY("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "FarmConsultation_status_check" CHECK("status" IN ('PENDING','ANSWERED','REFERENCE','NEEDS_REVIEW','FAILED')),
 CONSTRAINT "FarmConsultation_tokens_check" CHECK("usageTokens">=0 AND "reservedTokens">=0)
);
CREATE UNIQUE INDEX "FarmConsultation_farmId_requestKey_key" ON "FarmConsultation"("farmId","requestKey");
CREATE INDEX "FarmConsultation_farmId_createdAt_idx" ON "FarmConsultation"("farmId","createdAt");
CREATE TABLE "AiQuota" (
 "id" TEXT PRIMARY KEY,"ownerId" TEXT NOT NULL,"day" VARCHAR(10) NOT NULL,"reservedTokens" INTEGER NOT NULL DEFAULT 0,"requests" INTEGER NOT NULL DEFAULT 0,
 CONSTRAINT "AiQuota_ownerId_fkey" FOREIGN KEY("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "AiQuota_values_check" CHECK("reservedTokens">=0 AND "requests">=0)
);
CREATE UNIQUE INDEX "AiQuota_ownerId_day_key" ON "AiQuota"("ownerId","day");
CREATE TABLE "FarmPayment" (
 "id" TEXT PRIMARY KEY,"orderId" TEXT NOT NULL,"requestKey" VARCHAR(80) NOT NULL,"amountWon" INTEGER NOT NULL,
 "provider" VARCHAR(20) NOT NULL,"status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',"providerKey" VARCHAR(200),"eventHash" VARCHAR(64),
 "version" INTEGER NOT NULL DEFAULT 1,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "FarmPayment_orderId_fkey" FOREIGN KEY("orderId") REFERENCES "FarmOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "FarmPayment_status_check" CHECK("status" IN ('PENDING','PROCESSING','PAID','FAILED','REFUND_PENDING','REFUNDED')),
 CONSTRAINT "FarmPayment_provider_check" CHECK("provider" IN ('SIMULATOR','TOSS_TEST')),
 CONSTRAINT "FarmPayment_amount_check" CHECK("amountWon">0 AND "version">0)
);
CREATE UNIQUE INDEX "FarmPayment_orderId_key" ON "FarmPayment"("orderId");
CREATE UNIQUE INDEX "FarmPayment_providerKey_key" ON "FarmPayment"("providerKey");
CREATE TABLE "PaymentEvent" (
 "id" TEXT PRIMARY KEY,"paymentId" TEXT NOT NULL,"action" VARCHAR(32) NOT NULL,"requestKey" VARCHAR(80) NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY("paymentId") REFERENCES "FarmPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PaymentEvent_paymentId_requestKey_key" ON "PaymentEvent"("paymentId","requestKey");
