-- AlterEnum: add KEYPAD_UNLOCK to AccessEventType (real keypad PIN entries synced from Tuya)
ALTER TYPE "AccessEventType" ADD VALUE 'KEYPAD_UNLOCK';

-- AlterTable: add externalRef to AccessEvent (dedup key for synced keypad logs, e.g. "tuya:{user_id}:{update_time}")
ALTER TABLE "AccessEvent" ADD COLUMN "externalRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AccessEvent_externalRef_key" ON "AccessEvent"("externalRef");
