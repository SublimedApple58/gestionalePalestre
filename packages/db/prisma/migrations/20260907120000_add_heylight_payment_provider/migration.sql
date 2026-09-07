-- Aggiunge il provider di pagamento HeyLight/Compass (BNPL) all'enum.
-- Additiva e non distruttiva: nessun dato esistente viene toccato.
ALTER TYPE "PaymentProvider" ADD VALUE 'HEYLIGHT';
