import { SubscriptionTier, UserRole, type UserSubscription } from "@gestionale/db";

const TIER_MONTHS: Record<SubscriptionTier, number> = {
  DAILY: 0,
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
  BIENNIAL: 24
};

export function tierLabel(tier: SubscriptionTier): string {
  switch (tier) {
    case SubscriptionTier.DAILY:
      return "Giornaliero";
    case SubscriptionTier.MONTHLY:
      return "Mensile";
    case SubscriptionTier.QUARTERLY:
      return "Trimestrale";
    case SubscriptionTier.YEARLY:
      return "Annuale";
    case SubscriptionTier.BIENNIAL:
      return "Biennale";
    default:
      return tier;
  }
}

/**
 * Listino pubblico mostrato al subscriber in /checkout.
 * Single source of truth per prezzi one-shot e rateizzazioni Revolut.
 * Importi in centesimi per evitare errori di arrotondamento.
 */
export const TIER_CATALOG = {
  DAILY: {
    oneShotCents: 1299,
    installments: null
  },
  MONTHLY: {
    oneShotCents: 6999,
    installments: null
  },
  QUARTERLY: {
    oneShotCents: 16999,
    installments: null
  },
  YEARLY: {
    oneShotCents: 44999,
    installments: { count: 12, amountCents: 4799 }
  },
  BIENNIAL: {
    oneShotCents: 74999,
    installments: { count: 2, amountCents: 37498 }
  }
} as const satisfies Partial<
  Record<
    SubscriptionTier,
    {
      oneShotCents: number;
      installments: { count: number; amountCents: number } | null;
    }
  >
>;

export type CheckoutTier = keyof typeof TIER_CATALOG;

export const CHECKOUT_TIERS: CheckoutTier[] = ["DAILY", "MONTHLY", "QUARTERLY", "YEARLY", "BIENNIAL"];

const EUR_FORMATTER = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2
});

export function formatEuroCents(cents: number): string {
  return EUR_FORMATTER.format(cents / 100);
}

export function computeSubscriptionEndDate(tier: SubscriptionTier, startsAt: Date): Date {
  const value = new Date(startsAt);

  if (tier === SubscriptionTier.DAILY) {
    return new Date(
      Date.UTC(
        value.getUTCFullYear(),
        value.getUTCMonth(),
        value.getUTCDate() + 1,
        value.getUTCHours(),
        value.getUTCMinutes(),
        value.getUTCSeconds(),
        value.getUTCMilliseconds()
      )
    );
  }

  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth() + TIER_MONTHS[tier],
      value.getUTCDate(),
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
      value.getUTCMilliseconds()
    )
  );
}

/**
 * Nuova scadenza che SI SOMMA alla copertura esistente invece di sovrascriverla.
 * Se l'utente ha già un abbonamento attivo (non disattivato) e non ancora scaduto,
 * la nuova durata parte dalla scadenza attuale (i giorni residui NON si perdono).
 * Altrimenti parte da `now`. Usato alla conferma del pagamento (one-shot e prima
 * rata) e vale anche come rinnovo senza buchi.
 */
export function computeExtendedEndDate(
  tier: SubscriptionTier,
  now: Date,
  current?: { endsAt: Date; deactivatedAt: Date | null } | null
): Date {
  const base =
    current && current.deactivatedAt == null && current.endsAt.getTime() > now.getTime()
      ? current.endsAt
      : now;
  return computeSubscriptionEndDate(tier, base);
}

export function isSubscriptionActive(
  subscription:
    | Pick<UserSubscription, "startsAt" | "endsAt"> & { deactivatedAt?: Date | null } | null,
  now: Date = new Date()
): boolean {
  if (!subscription) {
    return false;
  }

  if (subscription.deactivatedAt) {
    return false;
  }

  return now >= subscription.startsAt && now <= subscription.endsAt;
}

/**
 * Giorni di grazia sull'ACCESSO ALLA PORTA dopo `endsAt`. Il rinnovo automatico
 * (webhook Revolut) è asincrono e non coincide con l'istante di scadenza: senza
 * grazia, tra la scadenza e l'arrivo del rinnovo il cron `tuya-pin-sync` toglie
 * il PIN e il pagante resta chiuso fuori senza colpa. La grazia copre quel ritardo
 * (incl. retry di dunning su rata fallita) mantenendo valido il codice.
 */
export const ACCESS_GRACE_DAYS = 2;
const ACCESS_GRACE_MS = ACCESS_GRACE_DAYS * 24 * 60 * 60 * 1000;

/**
 * Idoneità all'ACCESSO FISICO (PIN sul tastierino) — NON allo stato di billing.
 * A differenza di `isSubscriptionActive` (netto su `endsAt`, usato per UI/billing),
 * concede una finestra di grazia di `ACCESS_GRACE_DAYS` oltre `endsAt` per assorbire
 * il ritardo del rinnovo automatico. La disattivazione MANUALE (`deactivatedAt`)
 * resta immediata: la grazia vale solo per la scadenza naturale per data.
 */
export function isEligibleForDoorAccess(
  subscription:
    | (Pick<UserSubscription, "startsAt" | "endsAt"> & { deactivatedAt?: Date | null })
    | null,
  now: Date = new Date()
): boolean {
  if (!subscription) return false;
  if (subscription.deactivatedAt) return false;
  if (now < subscription.startsAt) return false;
  return now.getTime() <= subscription.endsAt.getTime() + ACCESS_GRACE_MS;
}

/**
 * Idoneità all'ACCESSO FISICO tramite PACCHETTO INGRESSI (alternativa admin-only
 * all'abbonamento). Attivo finché non annullato e con ingressi residui > 0.
 * A differenza dell'abbonamento non è a tempo: è a consumo (nessuna grazia).
 */
export function isEntryPackageActive(
  entryPackage: { deactivatedAt?: Date | null; remainingEntries: number } | null | undefined
): boolean {
  if (!entryPackage) return false;
  if (entryPackage.deactivatedAt) return false;
  return entryPackage.remainingEntries > 0;
}

/**
 * DECISIONE UNICA per l'accesso porta (PIN sul tastierino), condivisa da tutte le
 * repliche (syncPinToKeypad, resync/migration/reassert). ADMIN/INSTRUCTOR hanno
 * sempre il PIN; il SUBSCRIBER lo ha se ha un abbonamento door-eligible OPPURE un
 * pacchetto ingressi attivo. Chi non è nessuno dei tre non ha PIN.
 */
export function shouldHaveDoorPin(
  input: {
    role: UserRole;
    subscription:
      | (Pick<UserSubscription, "startsAt" | "endsAt"> & { deactivatedAt?: Date | null })
      | null;
    entryPackage: { deactivatedAt?: Date | null; remainingEntries: number } | null | undefined;
  },
  now: Date = new Date()
): boolean {
  if (input.role === UserRole.ADMIN || input.role === UserRole.INSTRUCTOR) return true;
  if (input.role !== UserRole.SUBSCRIBER) return false;
  return (
    isEligibleForDoorAccess(input.subscription, now) || isEntryPackageActive(input.entryPackage)
  );
}

export type SubscriptionStatus =
  | "none" // nessun abbonamento
  | "deactivated" // disattivato manualmente
  | "pending" // deve ancora iniziare (startsAt nel futuro)
  | "active" // in corso
  | "expired"; // periodo terminato (endsAt nel passato)

/**
 * Stato dettagliato dell'abbonamento. A differenza di `isSubscriptionActive`
 * (booleano) distingue "programmato/futuro" da "scaduto": un abbonamento che
 * deve ancora iniziare NON è scaduto → evita l'assurdo "scaduto il <data futura>".
 */
export function subscriptionStatus(
  subscription:
    | (Pick<UserSubscription, "startsAt" | "endsAt"> & { deactivatedAt?: Date | null })
    | null,
  now: Date = new Date()
): SubscriptionStatus {
  if (!subscription) return "none";
  if (subscription.deactivatedAt) return "deactivated";
  if (now < subscription.startsAt) return "pending";
  if (now > subscription.endsAt) return "expired";
  return "active";
}
