"use server";

import { db, InstallmentPlanStatus } from "@gestionale/db";

import { getSessionUser } from "@/lib/session";

/**
 * Ritorna true se l'utente loggato ha un abbonamento a rate ATTIVO (addebito
 * ricorrente SEPA SDD) ma non ha ancora preso visione del mandato → deve vedere
 * il gate bloccante. False per chiunque altro (non loggato, non a rate, già
 * accettato).
 */
export async function getSddMandateStatus(): Promise<boolean> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return false;

  const [user, activePlan] = await Promise.all([
    db.user.findUnique({
      where: { id: sessionUser.id },
      select: { sddMandateAcceptedAt: true }
    }),
    db.installmentPlan.findFirst({
      where: { userId: sessionUser.id, status: InstallmentPlanStatus.ACTIVE },
      select: { id: true }
    })
  ]);

  return Boolean(activePlan) && !user?.sddMandateAcceptedAt;
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
