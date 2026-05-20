import { SubscriptionTier, type UserSubscription } from "@gestionale/db";

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
 * Single source of truth per prezzi one-shot e rateizzazioni SumUp.
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
