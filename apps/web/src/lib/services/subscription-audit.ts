import { AuditAction, type PrismaClient, type UserSubscription } from "@gestionale/db";

import { logAdminAction } from "./audit-log-service";

type SubscriptionLike = Partial<
  Pick<
    UserSubscription,
    "tier" | "startsAt" | "endsAt" | "deactivatedAt" | "endsAtManual" | "arrearsSuspendedAt"
  >
>;

const iso = (d: Date | null | undefined): string | null => (d ? new Date(d).toISOString() : null);

/** Fotografia confrontabile (date in ISO) dei campi che determinano la copertura. */
export function snapshotSubscription(s: SubscriptionLike | null | undefined) {
  if (!s) return null;
  return {
    tier: s.tier ?? null,
    startsAt: iso(s.startsAt),
    endsAt: iso(s.endsAt),
    deactivatedAt: iso(s.deactivatedAt),
    endsAtManual: s.endsAtManual ?? false,
    arrearsSuspendedAt: iso(s.arrearsSuspendedAt)
  };
}

/**
 * Audit delle modifiche AUTOMATICHE alla subscription (pagamenti, rate, insoluti).
 * Prima queste scritture erano silenziose: per ricostruire una scadenza persa
 * bisognava indovinare da `updatedAt`. Ora ogni cambio lascia `before/after` con
 * la sorgente. Va chiamato DOPO il commit della transazione: `logAdminAction` è
 * throw-safe, quindi un problema di log non blocca mai un pagamento.
 * No-op se nulla di rilevante è cambiato.
 */
export async function logSubscriptionAutoChange(
  prisma: PrismaClient,
  input: {
    userId: string;
    source: string;
    before: SubscriptionLike | null | undefined;
    after: SubscriptionLike | null | undefined;
  }
): Promise<void> {
  const before = snapshotSubscription(input.before);
  const after = snapshotSubscription(input.after);
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  await logAdminAction(prisma, {
    actorId: null,
    targetUserId: input.userId,
    action: AuditAction.SUBSCRIPTION_AUTO_UPDATED,
    payload: { source: input.source, before, after }
  });
}
