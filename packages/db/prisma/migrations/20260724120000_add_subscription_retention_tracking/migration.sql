-- AlterTable: tracking fidelizzazione su UserSubscription
ALTER TABLE "UserSubscription" ADD COLUMN "autoRenew" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserSubscription" ADD COLUMN "canceledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "UserSubscription_canceledAt_idx" ON "UserSubscription"("canceledAt");
CREATE INDEX "UserSubscription_autoRenew_idx" ON "UserSubscription"("autoRenew");

-- Backfill: chi ha un piano rateale ATTIVO con subscription Revolut ricorrente
-- ha di fatto il rinnovo automatico. canceledAt non e' backfillabile in modo
-- affidabile dallo storico -> resta NULL (churn storico parziale, come concordato).
UPDATE "UserSubscription" us
SET "autoRenew" = true
WHERE EXISTS (
  SELECT 1 FROM "InstallmentPlan" ip
  WHERE ip."userId" = us."userId"
    AND ip."status" = 'ACTIVE'
    AND ip."revolutSubscriptionId" IS NOT NULL
);
