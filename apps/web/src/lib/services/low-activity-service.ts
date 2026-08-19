import { Prisma, type PrismaClient } from "@gestionale/db";

/**
 * Iscritti ATTIVI (abbonamento o pacchetto ingressi valido) che non entrano in
 * palestra da almeno `days` giorni — candidati da ricontattare. Il segnale d'uso
 * è l'accesso reale al tastierino (`KEYPAD_UNLOCK`); DOOR_OPEN/ENTRY_SIMULATION
 * non contano. Ordinati dal più "freddo" (nessun accesso o accesso più vecchio).
 *
 * TIMEZONE: `occurredAt` è timestamp UTC; il confronto usa `now() AT TIME ZONE 'UTC'`
 * per restare nello stesso dominio (coerente con gym-stats-service.ts).
 */

export type LowActivitySubscriber = {
  id: string;
  firstName: string;
  lastName: string;
  lastAccessAt: Date | null;
};

export async function listLowActivitySubscribers(
  db: PrismaClient,
  opts: { days?: number; take?: number } = {}
): Promise<LowActivitySubscriber[]> {
  const days = Math.min(Math.max(opts.days ?? 15, 1), 365);
  const take = Math.min(Math.max(opts.take ?? 100, 1), 500);

  const rows = await db.$queryRaw<
    { id: string; firstName: string; lastName: string; lastAccess: Date | null }[]
  >(Prisma.sql`
    SELECT u.id, u."firstName", u."lastName",
      (SELECT max(a."occurredAt") FROM "AccessEvent" a
        WHERE a."userId" = u.id AND a."eventType" = 'KEYPAD_UNLOCK') AS "lastAccess"
    FROM "User" u
    WHERE u."role" = 'SUBSCRIBER'
      AND (
        EXISTS (SELECT 1 FROM "UserSubscription" s
          WHERE s."userId" = u.id AND s."deactivatedAt" IS NULL
            AND s."startsAt" <= (now() AT TIME ZONE 'UTC') AND s."endsAt" >= (now() AT TIME ZONE 'UTC'))
        OR EXISTS (SELECT 1 FROM "UserEntryPackage" e
          WHERE e."userId" = u.id AND e."deactivatedAt" IS NULL AND e."remainingEntries" > 0)
      )
      AND NOT EXISTS (SELECT 1 FROM "AccessEvent" a
        WHERE a."userId" = u.id AND a."eventType" = 'KEYPAD_UNLOCK'
          AND a."occurredAt" >= (now() AT TIME ZONE 'UTC') - ${`${days} days`}::interval)
    ORDER BY "lastAccess" ASC NULLS FIRST, u."lastName" ASC
    LIMIT ${take}`);

  return rows.map((r) => ({
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    lastAccessAt: r.lastAccess ? new Date(r.lastAccess) : null
  }));
}
