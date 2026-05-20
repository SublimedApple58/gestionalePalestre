-- AlterEnum: add DAILY and QUARTERLY to SubscriptionTier
ALTER TYPE "SubscriptionTier" ADD VALUE 'DAILY';
ALTER TYPE "SubscriptionTier" ADD VALUE 'QUARTERLY';

-- AlterTable: add sumupCustomerId to User
ALTER TABLE "User" ADD COLUMN "sumupCustomerId" TEXT;

-- AlterTable: add sumupCardToken to InstallmentPlan
ALTER TABLE "InstallmentPlan" ADD COLUMN "sumupCardToken" TEXT;

-- AlterTable: add providerReference to Installment
ALTER TABLE "Installment" ADD COLUMN "providerReference" TEXT;
