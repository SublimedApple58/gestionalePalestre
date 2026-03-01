-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DocumentType" AS ENUM ('TAX_CODE', 'IDENTITY_DOCUMENT', 'MEDICAL_CERTIFICATE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserDocument" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "DocumentType" NOT NULL,
  "fileLabel" TEXT NOT NULL,
  "uploadedById" TEXT,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UserDocument_userId_type_key" ON "UserDocument"("userId", "type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserDocument_userId_uploadedAt_idx" ON "UserDocument"("userId", "uploadedAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserDocument_uploadedById_idx" ON "UserDocument"("uploadedById");

-- AddForeignKey
ALTER TABLE "UserDocument" ADD CONSTRAINT "UserDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDocument" ADD CONSTRAINT "UserDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
