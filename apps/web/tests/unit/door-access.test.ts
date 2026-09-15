import { UserRole } from "@gestionale/db";

import { isEligibleForDoorAccess, shouldHaveDoorPin } from "@/lib/subscription";

const now = new Date("2026-09-15T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const startsPast = new Date(now.getTime() - 30 * DAY);
const expired1d = new Date(now.getTime() - 1 * DAY); // scaduto ieri
const expired3d = new Date(now.getTime() - 3 * DAY); // scaduto oltre la grazia (2gg)
const future = new Date(now.getTime() + 5 * DAY);

describe("isEligibleForDoorAccess — grazia solo per rinnovo automatico", () => {
  it("BUG FIX: abbonamento SCADUTO non-rinnovante è bloccato subito", () => {
    expect(
      isEligibleForDoorAccess(
        { startsAt: startsPast, endsAt: expired1d, deactivatedAt: null, autoRenew: false },
        now
      )
    ).toBe(false);
  });

  it("senza autoRenew (campo assente) nessuna grazia → scaduto bloccato", () => {
    expect(
      isEligibleForDoorAccess({ startsAt: startsPast, endsAt: expired1d, deactivatedAt: null }, now)
    ).toBe(false);
  });

  it("rinnovo automatico scaduto ENTRO la grazia (2gg) resta idoneo", () => {
    expect(
      isEligibleForDoorAccess(
        { startsAt: startsPast, endsAt: expired1d, deactivatedAt: null, autoRenew: true },
        now
      )
    ).toBe(true);
  });

  it("rinnovo automatico OLTRE la grazia è bloccato", () => {
    expect(
      isEligibleForDoorAccess(
        { startsAt: startsPast, endsAt: expired3d, deactivatedAt: null, autoRenew: true },
        now
      )
    ).toBe(false);
  });

  it("abbonamento attivo è idoneo (a prescindere da autoRenew)", () => {
    expect(
      isEligibleForDoorAccess(
        { startsAt: startsPast, endsAt: future, deactivatedAt: null, autoRenew: false },
        now
      )
    ).toBe(true);
  });

  it("programmato (startsAt futuro) non idoneo", () => {
    expect(
      isEligibleForDoorAccess(
        { startsAt: future, endsAt: new Date(future.getTime() + 30 * DAY), deactivatedAt: null, autoRenew: true },
        now
      )
    ).toBe(false);
  });

  it("disattivato manualmente non idoneo", () => {
    expect(
      isEligibleForDoorAccess(
        { startsAt: startsPast, endsAt: future, deactivatedAt: now, autoRenew: true },
        now
      )
    ).toBe(false);
  });
});

describe("shouldHaveDoorPin — decisione unica accesso porta", () => {
  const expiredSub = { startsAt: startsPast, endsAt: expired1d, deactivatedAt: null, autoRenew: false };

  it("SUBSCRIBER con abbonamento scaduto non-rinnovante → niente PIN", () => {
    expect(
      shouldHaveDoorPin(
        { role: UserRole.SUBSCRIBER, subscription: expiredSub, entryPackage: null },
        now
      )
    ).toBe(false);
  });

  it("ADMIN ha sempre il PIN anche con abbonamento scaduto", () => {
    expect(
      shouldHaveDoorPin({ role: UserRole.ADMIN, subscription: expiredSub, entryPackage: null }, now)
    ).toBe(true);
  });

  it("SUBSCRIBER scaduto ma con pacchetto ingressi residuo → PIN", () => {
    expect(
      shouldHaveDoorPin(
        {
          role: UserRole.SUBSCRIBER,
          subscription: expiredSub,
          entryPackage: { deactivatedAt: null, remainingEntries: 3 }
        },
        now
      )
    ).toBe(true);
  });
});
