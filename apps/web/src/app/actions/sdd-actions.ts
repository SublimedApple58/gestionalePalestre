"use server";

import { db } from "@gestionale/db";

import { getSessionUser } from "@/lib/session";

/**
 * Ritorna true se l'utente loggato non ha ancora preso visione del mandato SEPA
 * SDD → deve vedere il gate bloccante. Mostrato a TUTTI gli utenti (qualsiasi
 * ruolo, qualsiasi abbonamento). False solo se non loggato o già accettato.
 */
export async function getSddMandateStatus(): Promise<boolean> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return false;

  const user = await db.user.findUnique({
    where: { id: sessionUser.id },
    select: { sddMandateAcceptedAt: true }
  });

  return !user?.sddMandateAcceptedAt;
}

/**
 * Registra la presa visione del mandato SEPA SDD per l'utente loggato.
 * Idempotente: scrive il timestamp solo alla prima accettazione.
 */
export async function acknowledgeSddMandateAction(): Promise<void> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return;

  await db.user.updateMany({
    where: { id: sessionUser.id, sddMandateAcceptedAt: null },
    data: { sddMandateAcceptedAt: new Date() }
  });
}
