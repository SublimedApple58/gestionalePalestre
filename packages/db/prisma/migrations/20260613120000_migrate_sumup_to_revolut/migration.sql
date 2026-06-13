-- Migrazione provider pagamenti: SumUp -> Revolut.
-- Nessun pagamento reale in produzione (confermato dall'utente): possiamo
-- rimuovere eventuali Payment di test col provider SUMUP e ricreare l'enum.

-- 1. User: sumupCustomerId -> revolutCustomerId
ALTER TABLE "User" RENAME COLUMN "sumupCustomerId" TO "revolutCustomerId";

-- 2. InstallmentPlan: sumupCardToken -> revolutSubscriptionId
--    (il token carta SumUp non serve piu'; ora memorizziamo l'id della
--     subscription Revolut nativa che gestisce gli addebiti ricorrenti)
ALTER TABLE "InstallmentPlan" RENAME COLUMN "sumupCardToken" TO "revolutSubscriptionId";

-- 3. Enum PaymentProvider: SUMUP -> REVOLUT.
--    Postgres non permette di rimuovere un valore enum in place: si ricrea il
--    tipo. Prima si eliminano eventuali Payment di test col vecchio provider,
--    altrimenti il cast USING fallirebbe.
DELETE FROM "Payment" WHERE "provider" = 'SUMUP';

ALTER TYPE "PaymentProvider" RENAME TO "PaymentProvider_old";
CREATE TYPE "PaymentProvider" AS ENUM ('REVOLUT', 'KLARNA', 'STRIPE');
ALTER TABLE "Payment"
  ALTER COLUMN "provider" TYPE "PaymentProvider"
  USING ("provider"::text::"PaymentProvider");
DROP TYPE "PaymentProvider_old";
