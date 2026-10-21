import { SubscriptionTier, UserRole, type UserSubscription } from "@gestionale/db";

import { romeDayEndExclusiveUtc, romeYmd } from "./datetime";

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
    // Pass giornaliero: vale fino a MEZZANOTTE (Europe/Rome) del giorno di
    // attivazione, non 24h dall'orario di acquisto. Vercel gira in UTC, quindi
    // la "mezzanotte italiana" si calcola via gli helper del fuso palestra:
    // romeDayEndExclusiveUtc(giorno) = inizio del giorno successivo in Rome.
    return romeDayEndExclusiveUtc(romeYmd(value));
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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * True se `endsAt` differisce dallo standard del piano (oltre 1 giorno di
 * tolleranza per orari/ora legale): è una scadenza impostata a mano dalla
 * reception (es. mesi residui "rottamati" da un'altra palestra). In quel caso la
 * subscription viene marcata `endsAtManual` e nessun ricalcolo automatico la tocca.
 */
export function isCustomEndsAt(tier: SubscriptionTier, startsAt: Date, endsAt: Date): boolean {
  const standard = computeSubscriptionEndDate(tier, startsAt);
  return Math.abs(endsAt.getTime() - standard.getTime()) > DAY_MS;
}

/**
 * Le scritture AUTOMATICHE non devono mai accorciare la copertura: ritorna la
 * scadenza più lontana tra quella attuale e quella ricalcolata.
 */
export function neverShorten(currentEndsAt: Date | null | undefined, candidate: Date): Date {
  if (!currentEndsAt) return candidate;
  return currentEndsAt.getTime() >= candidate.getTime() ? new Date(currentEndsAt) : candidate;
}

/**
 * Fine copertura EFFETTIVA: la scadenza reale, oppure l'inizio della
 * sospensione per rata insoluta se precedente. Replica esattamente il vecchio
 * "taglio" di endsAt senza perdere la scadenza reale.
 */
export function effectiveEndsAt(subscription: {
  endsAt: Date;
  arrearsSuspendedAt?: Date | null;
}): Date {
  const susp = subscription.arrearsSuspendedAt;
  return susp && susp.getTime() < subscription.endsAt.getTime() ? susp : subscription.endsAt;
}

export function isSuspendedForArrears(
  subscription: { endsAt: Date; arrearsSuspendedAt?: Date | null } | null | undefined,
  now: Date = new Date()
): boolean {
  return !!subscription?.arrearsSuspendedAt && subscription.arrearsSuspendedAt.getTime() <= now.getTime();
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
    | Pick<UserSubscription, "startsAt" | "endsAt"> & {
        deactivatedAt?: Date | null;
        arrearsSuspendedAt?: Date | null;
      }
    | null,
  now: Date = new Date()
): boolean {
  if (!subscription) {
    return false;
  }

  if (subscription.deactivatedAt) {
    return false;
  }

  return now >= subscription.startsAt && now <= effectiveEndsAt(subscription);
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
/**
 * Campi minimi per decidere l'accesso porta. `arrearsSuspendedAt` è OBBLIGATORIO
 * di proposito: chi seleziona la subscription per decidere il PIN deve leggerlo,
 * altrimenti un iscritto con rata insoluta resterebbe dentro (fail-open).
 */
export type DoorAccessSubscription = Pick<UserSubscription, "startsAt" | "endsAt"> & {
  deactivatedAt?: Date | null;
  autoRenew?: boolean | null;
  arrearsSuspendedAt: Date | null;
};

export function isEligibleForDoorAccess(
  subscription: DoorAccessSubscription | null,
  now: Date = new Date()
): boolean {
  if (!subscription) return false;
  if (subscription.deactivatedAt) return false;
  if (now < subscription.startsAt) return false;
  // La grazia post-scadenza esiste SOLO per coprire il ritardo del rinnovo
  // automatico asincrono (webhook Revolut dei piani a rate): si applica quindi
  // unicamente agli abbonamenti con `autoRenew`. Un abbonamento che NON si rinnova
  // da solo (one-shot, DAILY, piano a rate saldato, disdetto) NON ha grazia →
  // scaduto = bloccato subito a `endsAt`. (Bug: prima la grazia era cieca e faceva
  // entrare qualsiasi scaduto per ~2-3 giorni.)
  // Rata insoluta: la copertura effettiva finisce all'inizio della sospensione
  // (stessa semantica del vecchio taglio di endsAt, grazia inclusa).
  const graceMs = subscription.autoRenew ? ACCESS_GRACE_MS : 0;
  return now.getTime() <= effectiveEndsAt(subscription).getTime() + graceMs;
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
    subscription: DoorAccessSubscription | null;
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
    | (Pick<UserSubscription, "startsAt" | "endsAt"> & {
        deactivatedAt?: Date | null;
        arrearsSuspendedAt?: Date | null;
      })
    | null,
  now: Date = new Date()
): SubscriptionStatus {
  if (!subscription) return "none";
  if (subscription.deactivatedAt) return "deactivated";
  if (now < subscription.startsAt) return "pending";
  // Rata insoluta = scaduto (come col vecchio taglio di endsAt), ma la scadenza
  // reale resta salva e torna valida al pagamento.
  if (now > effectiveEndsAt(subscription)) return "expired";
  return "active";
}
