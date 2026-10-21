-- Migrazione ADDITIVA (nessuna colonna rimossa/rinominata, default sicuri).
-- 1) Flag "scadenza impostata a mano": nessun ricalcolo automatico la riscrive.
-- 2) Sospensione per rata insoluta su campo separato (endsAt non si taglia più).
-- 3) Azione di audit per le modifiche automatiche alla subscription.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'SUBSCRIPTION_AUTO_UPDATED';

-- AlterTable
ALTER TABLE "UserSubscription"
  ADD COLUMN "endsAtManual" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "arrearsSuspendedAt" TIMESTAMP(3);
