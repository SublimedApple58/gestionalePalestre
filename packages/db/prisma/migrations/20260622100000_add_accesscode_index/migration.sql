-- CreateIndex
-- Lookup per codice (mappatura sblocco tastierino -> utente, vedi recordKeypadUnlock).
-- accessCode NON e' unico: l'unicita' va gestita a livello applicativo.
CREATE INDEX "User_accessCode_idx" ON "User"("accessCode");
