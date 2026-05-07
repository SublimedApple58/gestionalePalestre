-- Aggiunge STRIPE al PaymentProvider per supportare il canale mobile (Apple/Google Pay nativi).
-- ALTER TYPE ... ADD VALUE è non transazionale in Postgres ma sicuro: nessun backfill richiesto.
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'STRIPE';
