-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('SUMUP', 'KLARNA');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "InstallmentPlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'DEFAULTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('SCHEDULED', 'PAID', 'FAILED', 'REFUNDED');

-- AlterEnum
ALTER TYPE "SubscriptionTier" ADD VALUE 'BIENNIAL';

-- DropIndex
DROP INDEX "UserDocument_userId_uploadedAt_idx";

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "provider" "PaymentProvider" NOT NULL,
    "providerReference" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "tier" "SubscriptionTier" NOT NULL,
    "paidAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "rawWebhookPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentPlan" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalAmountCents" INTEGER NOT NULL,
    "installmentsCount" INTEGER NOT NULL,
    "installmentAmountCents" INTEGER NOT NULL,
    "klarnaOrderId" TEXT,
    "firstChargeAt" TIMESTAMP(3) NOT NULL,
    "status" "InstallmentPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installment" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "paidAt" TIMESTAMP(3),
    "klarnaCaptureId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerReference_provider_key" ON "Payment"("providerReference", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentPlan_paymentId_key" ON "InstallmentPlan"("paymentId");

-- CreateIndex
CREATE INDEX "InstallmentPlan_userId_status_idx" ON "InstallmentPlan"("userId", "status");

-- CreateIndex
CREATE INDEX "InstallmentPlan_status_firstChargeAt_idx" ON "InstallmentPlan"("status", "firstChargeAt");

-- CreateIndex
CREATE INDEX "Installment_status_dueAt_idx" ON "Installment"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Installment_planId_sequenceNumber_key" ON "Installment"("planId", "sequenceNumber");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InstallmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
