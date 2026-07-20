import { SubscriptionTier } from "@gestionale/db";

import {
  computeExtendedEndDate,
  computeSubscriptionEndDate,
  isSubscriptionActive
} from "@/lib/subscription";

describe("subscription utils", () => {
  it("calcola correttamente la data di fine per il piano biennale", () => {
    const startsAt = new Date("2026-01-15T00:00:00.000Z");
    const endsAt = computeSubscriptionEndDate(SubscriptionTier.BIENNIAL, startsAt);

    expect(endsAt.getUTCFullYear()).toBe(2028);
    expect(endsAt.getUTCMonth()).toBe(0);
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

  describe("computeExtendedEndDate — la nuova copertura si somma a quella esistente", () => {
    const now = new Date("2026-07-20T09:00:00.000Z");

    it("caso Marco: annuale su un mensile ancora attivo → parte dalla scadenza del mensile", () => {
      const current = {
        endsAt: new Date("2026-08-10T09:39:55.000Z"),
        deactivatedAt: null
      };
      const endsAt = computeExtendedEndDate(SubscriptionTier.YEARLY, now, current);
      // 10/08/2026 + 12 mesi = 10/08/2027 (i ~20 giorni di mensile NON si perdono)
      expect(endsAt.getUTCFullYear()).toBe(2027);
      expect(endsAt.getUTCMonth()).toBe(7); // agosto
      expect(endsAt.getUTCDate()).toBe(10);
    });

    it("nessun abbonamento esistente → parte da adesso", () => {
      const endsAt = computeExtendedEndDate(SubscriptionTier.MONTHLY, now, null);
      expect(endsAt.getUTCFullYear()).toBe(2026);
      expect(endsAt.getUTCMonth()).toBe(7); // agosto (luglio + 1)
      expect(endsAt.getUTCDate()).toBe(20);
    });

    it("abbonamento già scaduto → parte da adesso, non dalla vecchia scadenza", () => {
      const expired = {
        endsAt: new Date("2026-06-01T00:00:00.000Z"),
        deactivatedAt: null
      };
      const endsAt = computeExtendedEndDate(SubscriptionTier.MONTHLY, now, expired);
      expect(endsAt.getUTCMonth()).toBe(7); // agosto (da now), non luglio
      expect(endsAt.getUTCDate()).toBe(20);
    });

    it("abbonamento disattivato a mano → non si accumula, parte da adesso", () => {
      const deactivated = {
        endsAt: new Date("2026-12-31T00:00:00.000Z"),
        deactivatedAt: new Date("2026-07-01T00:00:00.000Z")
      };
      const endsAt = computeExtendedEndDate(SubscriptionTier.MONTHLY, now, deactivated);
      expect(endsAt.getUTCMonth()).toBe(7); // agosto (da now)
      expect(endsAt.getUTCDate()).toBe(20);
    });
  });
});
