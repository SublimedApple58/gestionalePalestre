-- Data migration: converti eventuali record ancora con tier=QUARTERLY a YEARLY mantenendo le date originali.
-- NB: la conversione effettiva sui dati è già stata eseguita via `prisma db execute` prima di creare questa migration,
-- ma il seguente UPDATE è idempotente e sicuro anche su DB nuovi.
UPDATE "UserSubscription" SET "tier" = 'YEARLY' WHERE "tier" = 'QUARTERLY';

-- Drop del valore enum QUARTERLY (Postgres non supporta DROP VALUE direttamente: ricreiamo il tipo).
BEGIN;
CREATE TYPE "SubscriptionTier_new" AS ENUM ('MONTHLY', 'YEARLY', 'BIENNIAL');
ALTER TABLE "UserSubscription" ALTER COLUMN "tier" TYPE "SubscriptionTier_new" USING ("tier"::text::"SubscriptionTier_new");
ALTER TABLE "Payment" ALTER COLUMN "tier" TYPE "SubscriptionTier_new" USING ("tier"::text::"SubscriptionTier_new");
ALTER TYPE "SubscriptionTier" RENAME TO "SubscriptionTier_old";
ALTER TYPE "SubscriptionTier_new" RENAME TO "SubscriptionTier";
DROP TYPE "SubscriptionTier_old";
COMMIT;
