-- Aggiunge il campo deactivatedAt a UserSubscription (soft-disable degli abbonamenti)
ALTER TABLE "UserSubscription" ADD COLUMN "deactivatedAt" TIMESTAMP(3);

-- Crea l'enum AuditAction
CREATE TYPE "AuditAction" AS ENUM (
  'USER_CREATED',
  'USER_DELETED',
  'ROLE_CHANGED',
  'INSTRUCTOR_ASSIGNED',
  'INSTRUCTOR_UNASSIGNED',
  'ADDRESS_UPDATED',
  'SUBSCRIPTION_ASSIGNED',
  'SUBSCRIPTION_DEACTIVATED',
  'SUBSCRIPTION_REACTIVATED',
  'SUBSCRIPTION_DATE_CHANGED',
  'DOC_APPROVED',
  'DOC_REJECTED',
  'DOC_REUPLOAD_REQUESTED'
);

-- Tabella audit log: append-only, FK al target/actor entrambi SET NULL per
-- preservare l'audit anche quando l'utente target o l'admin attore vengono
-- eliminati. targetSnapshot conserva nome/email del target al momento del log.
CREATE TABLE "UserAuditLog" (
  "id"             TEXT          NOT NULL,
  "targetUserId"   TEXT,
  "actorId"        TEXT,
  "targetSnapshot" JSONB,
  "action"         "AuditAction" NOT NULL,
  "payload"        JSONB,
  "createdAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserAuditLog_targetUserId_createdAt_idx"
  ON "UserAuditLog" ("targetUserId", "createdAt" DESC);

CREATE INDEX "UserAuditLog_actorId_createdAt_idx"
  ON "UserAuditLog" ("actorId", "createdAt" DESC);

ALTER TABLE "UserAuditLog"
  ADD CONSTRAINT "UserAuditLog_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserAuditLog"
  ADD CONSTRAINT "UserAuditLog_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
