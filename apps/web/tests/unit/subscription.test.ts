import { SubscriptionTier } from "@gestionale/db";

import { computeSubscriptionEndDate, isSubscriptionActive } from "@/lib/subscription";

describe("subscription utils", () => {
  it("calcola correttamente la data di fine per il piano trimestrale", () => {
    const startsAt = new Date("2026-01-15T00:00:00.000Z");
    const endsAt = computeSubscriptionEndDate(SubscriptionTier.QUARTERLY, startsAt);

    expect(endsAt.getUTCFullYear()).toBe(2026);
    expect(endsAt.getUTCMonth()).toBe(3);
    expect(endsAt.getUTCDate()).toBe(15);
  });

  it("riconosce abbonamento attivo/inattivo", () => {
    const activeSubscription = {
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
      endsAt: new Date("2026-12-31T23:59:59.999Z")
    };

    const inactiveSubscription = {
      startsAt: new Date("2025-01-01T00:00:00.000Z"),
      endsAt: new Date("2025-12-31T23:59:59.999Z")
    };

    const now = new Date("2026-03-01T12:00:00.000Z");

    expect(isSubscriptionActive(activeSubscription, now)).toBe(true);
    expect(isSubscriptionActive(inactiveSubscription, now)).toBe(false);
  });
});
