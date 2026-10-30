ALTER TABLE "User"
 ADD COLUMN "role" VARCHAR(16) NOT NULL DEFAULT 'USER',
 ADD COLUMN "suspendedAt" TIMESTAMP(3), ADD COLUMN "deletedAt" TIMESTAMP(3),
 ADD COLUMN "emailVerifiedAt" TIMESTAMP(3), ADD COLUMN "mfaSecret" TEXT,
 ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "mfaLastStep" BIGINT NOT NULL DEFAULT -1,
 ADD COLUMN "recoveryHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 ADD COLUMN "notificationEmail" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD CONSTRAINT "User_role_check" CHECK ("role" IN ('USER', 'ADMIN'));
ALTER TABLE "Note" ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "StoredFile" ADD COLUMN "sha256" VARCHAR(64);
CREATE TABLE "AuditEvent" (
 "id" TEXT PRIMARY KEY, "actorId" TEXT, "action" VARCHAR(80) NOT NULL,
 "targetId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");
CREATE TABLE "AccountAction" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "kind" VARCHAR(20) NOT NULL, "tokenHash" TEXT NOT NULL UNIQUE,
 "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "AccountAction_expiresAt_idx" ON "AccountAction"("expiresAt");
CREATE TABLE "Notification" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "title" VARCHAR(120) NOT NULL, "message" VARCHAR(2000) NOT NULL, "readAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

ALTER TABLE "StoredFile" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE TABLE "IdempotentRequest" (
 "id" TEXT PRIMARY KEY, "scope" VARCHAR(160) NOT NULL, "key" VARCHAR(128) NOT NULL,
 "requestHash" VARCHAR(64) NOT NULL, "response" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "IdempotentRequest_scope_key_key" ON "IdempotentRequest"("scope", "key");
CREATE INDEX "IdempotentRequest_createdAt_idx" ON "IdempotentRequest"("createdAt");

ALTER TABLE "User" ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "lockedUntil" TIMESTAMP(3);
CREATE INDEX "StoredFile_ownerId_sha256_idx" ON "StoredFile"("ownerId", "sha256");

ALTER TABLE "User" ADD COLUMN "mfaSetupExpiresAt" TIMESTAMP(3);

ALTER TABLE "AccountAction" ADD COLUMN "pendingEmail" VARCHAR(254), ADD COLUMN "issuedVersion" INTEGER NOT NULL DEFAULT 0;
