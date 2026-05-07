import { SubscriptionTier, type UserSubscription } from "@gestionale/db";

const TIER_MONTHS: Record<SubscriptionTier, number> = {
  MONTHLY: 1,
  YEARLY: 12,
  BIENNIAL: 24
};

export function tierLabel(tier: SubscriptionTier): string {
  switch (tier) {
    case SubscriptionTier.MONTHLY:
      return "Mensile";
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
 * Single source of truth per prezzi one-shot e rateizzazioni Klarna.
 * Importi in centesimi per evitare errori di arrotondamento.
 */
export const TIER_CATALOG = {
  MONTHLY: {
    oneShotCents: 7000,
    installments: null
  },
  YEARLY: {
    oneShotCents: 45000,
    installments: { count: 12, amountCents: 4700 }
  },
  BIENNIAL: {
    oneShotCents: 70000,
    installments: { count: 24, amountCents: 4000 }
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

export const CHECKOUT_TIERS: CheckoutTier[] = ["MONTHLY", "YEARLY", "BIENNIAL"];

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
