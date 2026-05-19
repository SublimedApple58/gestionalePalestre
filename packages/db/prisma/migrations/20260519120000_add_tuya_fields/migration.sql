-- AlterTable
ALTER TABLE "User" ADD COLUMN "tuyaUserId" TEXT,
ADD COLUMN "tuyaPinUnlockNo" TEXT,
ADD COLUMN "tuyaPinActive" BOOLEAN NOT NULL DEFAULT false;
