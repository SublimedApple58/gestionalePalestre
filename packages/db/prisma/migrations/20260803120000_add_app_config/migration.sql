-- CreateTable
CREATE TABLE "AppConfig" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("key")
);

-- Seed: versione minima supportata dell'app mobile. Inizialmente 0.1.0 = gate
-- SPENTO (nessun client bloccato). Verra' alzata a 1.0.0 SOLO quando la build
-- 1.0.0 sara' live su App Store (Fase 4), con un semplice UPDATE.
INSERT INTO "AppConfig" ("key", "value", "updatedAt")
VALUES ('minSupportedVersion', '0.1.0', CURRENT_TIMESTAMP);

-- Seed: link store usato dal gate "forza aggiornamento". Placeholder: va
-- sostituito con l'URL reale della scheda App Store prima/insieme alla Fase 4.
INSERT INTO "AppConfig" ("key", "value", "updatedAt")
VALUES ('iosStoreUrl', 'https://apps.apple.com/app/house-of-muscle', CURRENT_TIMESTAMP);
