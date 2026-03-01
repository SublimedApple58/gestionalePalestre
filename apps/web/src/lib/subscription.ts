import { SubscriptionTier, type UserSubscription } from "@gestionale/db";

const TIER_MONTHS: Record<SubscriptionTier, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12
};

export function tierLabel(tier: SubscriptionTier): string {
  switch (tier) {
    case SubscriptionTier.MONTHLY:
      return "Mensile";
    case SubscriptionTier.QUARTERLY:
      return "Trimestrale";
    case SubscriptionTier.YEARLY:
      return "Annuale";
    default:
      return tier;
  }
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
  subscription: Pick<UserSubscription, "startsAt" | "endsAt"> | null,
  now: Date = new Date()
): boolean {
  if (!subscription) {
    return false;
  }

  return now >= subscription.startsAt && now <= subscription.endsAt;
}
