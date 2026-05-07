-- Estende l'enum AuditAction con le 2 nuove azioni workout
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WORKOUT_TEMPLATE_ASSIGNED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WORKOUT_TEMPLATE_UNASSIGNED';

-- Crea l'enum WorkoutSetType
CREATE TYPE "WorkoutSetType" AS ENUM (
  'NORMAL',
  'WARMUP',
  'DROPSET',
  'CLUSTERSET',
  'REST_PAUSE',
  'AMRAP',
  'FAILURE'
);

-- Crea l'enum WorkoutTemplateVisibility
CREATE TYPE "WorkoutTemplateVisibility" AS ENUM (
  'PRIVATE',
  'ASSIGNABLE'
);

-- Catalogo esercizi pre-popolato (vedi seed.mjs)
CREATE TABLE "Exercise" (
  "id"          TEXT         NOT NULL,
  "name"        TEXT         NOT NULL,
  "muscleGroup" TEXT,
  "equipment"   TEXT,
  "notes"       TEXT,
  "isCustom"    BOOLEAN      NOT NULL DEFAULT false,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Exercise_name_key" ON "Exercise" ("name");
CREATE INDEX "Exercise_muscleGroup_idx" ON "Exercise" ("muscleGroup");
CREATE INDEX "Exercise_isCustom_idx" ON "Exercise" ("isCustom");

-- Schede di allenamento (template). Cascade su delete del creator.
CREATE TABLE "WorkoutTemplate" (
  "id"          TEXT                        NOT NULL,
  "name"        TEXT                        NOT NULL,
  "description" TEXT,
  "daysPerWeek" INTEGER                     NOT NULL,
  "visibility"  "WorkoutTemplateVisibility" NOT NULL DEFAULT 'ASSIGNABLE',
  "createdById" TEXT                        NOT NULL,
  "createdAt"   TIMESTAMP(3)                NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3)                NOT NULL,

  CONSTRAINT "WorkoutTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkoutTemplate_createdById_idx" ON "WorkoutTemplate" ("createdById");
CREATE INDEX "WorkoutTemplate_visibility_idx" ON "WorkoutTemplate" ("visibility");

ALTER TABLE "WorkoutTemplate"
  ADD CONSTRAINT "WorkoutTemplate_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sedute della scheda
CREATE TABLE "WorkoutTemplateSession" (
  "id"         TEXT    NOT NULL,
  "templateId" TEXT    NOT NULL,
  "order"      INTEGER NOT NULL,
  "name"       TEXT    NOT NULL,

  CONSTRAINT "WorkoutTemplateSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkoutTemplateSession_templateId_order_key"
  ON "WorkoutTemplateSession" ("templateId", "order");
CREATE INDEX "WorkoutTemplateSession_templateId_idx"
  ON "WorkoutTemplateSession" ("templateId");

ALTER TABLE "WorkoutTemplateSession"
  ADD CONSTRAINT "WorkoutTemplateSession_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Esercizi all'interno di una seduta. exerciseName e' uno snapshot
-- per leggibilita' anche dopo rinomine/cancellazioni del catalogo.
CREATE TABLE "WorkoutTemplateExercise" (
  "id"           TEXT    NOT NULL,
  "sessionId"    TEXT    NOT NULL,
  "exerciseId"   TEXT    NOT NULL,
  "exerciseName" TEXT    NOT NULL,
  "order"        INTEGER NOT NULL,
  "notes"        TEXT,

  CONSTRAINT "WorkoutTemplateExercise_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkoutTemplateExercise_sessionId_idx"
  ON "WorkoutTemplateExercise" ("sessionId");
CREATE INDEX "WorkoutTemplateExercise_exerciseId_idx"
  ON "WorkoutTemplateExercise" ("exerciseId");

ALTER TABLE "WorkoutTemplateExercise"
  ADD CONSTRAINT "WorkoutTemplateExercise_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "WorkoutTemplateSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkoutTemplateExercise"
  ADD CONSTRAINT "WorkoutTemplateExercise_exerciseId_fkey"
  FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Singole serie prescritte
CREATE TABLE "WorkoutTemplateSet" (
  "id"         TEXT             NOT NULL,
  "exerciseId" TEXT             NOT NULL,
  "order"      INTEGER          NOT NULL,
  "type"       "WorkoutSetType" NOT NULL DEFAULT 'NORMAL',
  "reps"       TEXT             NOT NULL,
  "rir"        INTEGER,
  "rest"       INTEGER,
  "notes"      TEXT,

  CONSTRAINT "WorkoutTemplateSet_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkoutTemplateSet_exerciseId_idx" ON "WorkoutTemplateSet" ("exerciseId");

ALTER TABLE "WorkoutTemplateSet"
  ADD CONSTRAINT "WorkoutTemplateSet_exerciseId_fkey"
  FOREIGN KEY ("exerciseId") REFERENCES "WorkoutTemplateExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Assegnazioni N:N scheda<->utente
CREATE TABLE "WorkoutAssignment" (
  "id"           TEXT         NOT NULL,
  "templateId"   TEXT         NOT NULL,
  "userId"       TEXT         NOT NULL,
  "assignedById" TEXT         NOT NULL,
  "assignedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WorkoutAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkoutAssignment_templateId_userId_key"
  ON "WorkoutAssignment" ("templateId", "userId");
CREATE INDEX "WorkoutAssignment_userId_idx" ON "WorkoutAssignment" ("userId");
CREATE INDEX "WorkoutAssignment_templateId_idx" ON "WorkoutAssignment" ("templateId");

ALTER TABLE "WorkoutAssignment"
  ADD CONSTRAINT "WorkoutAssignment_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkoutAssignment"
  ADD CONSTRAINT "WorkoutAssignment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkoutAssignment"
  ADD CONSTRAINT "WorkoutAssignment_assignedById_fkey"
  FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
