-- Presa visione mandato SEPA SDD (addebito ricorrente): timestamp prima accettazione.
ALTER TABLE "User" ADD COLUMN "sddMandateAcceptedAt" TIMESTAMP(3);
