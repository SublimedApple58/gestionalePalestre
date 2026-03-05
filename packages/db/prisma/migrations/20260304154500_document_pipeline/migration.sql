ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'PROFILE_PHOTO';

CREATE TYPE "DocumentSide" AS ENUM ('FRONT', 'BACK', 'SINGLE');
CREATE TYPE "DocumentStatus" AS ENUM (
  'UPLOADED',
  'AI_PROCESSING',
  'NEEDS_REUPLOAD',
  'PENDING_ADMIN_REVIEW',
  'APPROVED',
  'REJECTED'
);
CREATE TYPE "DocumentJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'ESCALATED');

ALTER TABLE "UserDocument"
ADD COLUMN "side" "DocumentSide" NOT NULL DEFAULT 'SINGLE',
ADD COLUMN "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
ADD COLUMN "storageKey" TEXT,
ADD COLUMN "fileName" TEXT,
ADD COLUMN "mimeType" TEXT,
ADD COLUMN "sizeBytes" INTEGER,
ADD COLUMN "sha256" VARCHAR(64),
ADD COLUMN "aiAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "aiConfidence" DOUBLE PRECISION,
ADD COLUMN "aiLastError" TEXT,
ADD COLUMN "extractedTaxCode" VARCHAR(16),
ADD COLUMN "extractedIdentityNumber" VARCHAR(20),
ADD COLUMN "medicalCertificateExpiresAt" TIMESTAMP(3),
ADD COLUMN "reviewedById" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "rejectionReason" TEXT;

UPDATE "UserDocument"
SET
  "storageKey" = COALESCE("storageKey", CONCAT('legacy/', "id")),
  "fileName" = COALESCE("fileName", "fileLabel"),
  "mimeType" = COALESCE("mimeType", 'application/octet-stream'),
  "sizeBytes" = COALESCE("sizeBytes", 0),
  "sha256" = COALESCE("sha256", repeat('0', 64)),
  "status" = 'APPROVED'::"DocumentStatus";

ALTER TABLE "UserDocument"
ALTER COLUMN "storageKey" SET NOT NULL,
ALTER COLUMN "fileName" SET NOT NULL,
ALTER COLUMN "mimeType" SET NOT NULL,
ALTER COLUMN "sizeBytes" SET NOT NULL,
ALTER COLUMN "sha256" SET NOT NULL;

ALTER TABLE "UserDocument"
ADD CONSTRAINT "UserDocument_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserDocument" DROP CONSTRAINT IF EXISTS "UserDocument_userId_type_key";

CREATE UNIQUE INDEX "UserDocument_userId_type_side_key" ON "UserDocument"("userId", "type", "side");
CREATE INDEX "UserDocument_userId_type_status_idx" ON "UserDocument"("userId", "type", "status");
CREATE INDEX "UserDocument_status_uploadedAt_idx" ON "UserDocument"("status", "uploadedAt" DESC);
CREATE INDEX "UserDocument_reviewedById_idx" ON "UserDocument"("reviewedById");

CREATE TABLE "DocumentProcessingJob" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "DocumentType" NOT NULL,
  "status" "DocumentJobStatus" NOT NULL DEFAULT 'QUEUED',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DocumentProcessingJob_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DocumentProcessingJob"
ADD CONSTRAINT "DocumentProcessingJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "DocumentProcessingJob_status_nextRunAt_createdAt_idx" ON "DocumentProcessingJob"("status", "nextRunAt", "createdAt");
CREATE INDEX "DocumentProcessingJob_userId_type_status_idx" ON "DocumentProcessingJob"("userId", "type", "status");
