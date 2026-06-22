-- AlterEnum: nuova azione di audit per l'iscrizione ad associazione sportiva
ALTER TYPE "AuditAction" ADD VALUE 'ASSOCIATION_MEMBERSHIP_CHANGED';

-- AlterTable: iscrizione ad associazione sportiva esterna + scadenza
ALTER TABLE "User" ADD COLUMN "associationMember" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "associationExpiresAt" TIMESTAMP(3);

-- CreateIndex: query "in scadenza" per la home admin
CREATE INDEX "User_associationMember_associationExpiresAt_idx" ON "User"("associationMember", "associationExpiresAt");
