-- Personal trainer (lista unica app iscritti + sito). Migrazione additiva: solo tabella nuova.
CREATE TABLE "PersonalTrainer" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "whatsappNumber" TEXT NOT NULL,
    "photoStorageKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalTrainer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PersonalTrainer_isVisible_sortOrder_idx" ON "PersonalTrainer"("isVisible", "sortOrder");
