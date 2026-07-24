import { Prisma, type PrismaClient } from "@gestionale/db";

/**
 * Servizio statistiche palestra (admin-only). UNICA implementazione, riusata dal
 * server component web (`/statistiche`) e dall'endpoint mobile
 * (`/api/mobile/admin/stats`) — così il contratto BE↔mobile non diverge.
 *
 * TIMEZONE: le colonne DateTime di Prisma sono `timestamp` SENZA time zone e
 * contengono UTC (Vercel gira in UTC). Per bucketizzare su ora legale italiana
 * si converte con la doppia AT TIME ZONE:
 *   ("col" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Rome'
 * (la prima interpreta il valore come UTC → timestamptz, la seconda dà l'orario
 * a muro di Roma). Senza questo, "ora di punta" e confini di giornata slittano
 * di 1–2h. Confronti temporali col "now" usano `now() AT TIME ZONE 'UTC'` per
 * restare nello stesso dominio (timestamp UTC) delle colonne.
 *
 * SEGNALE D'USO: l'unico proxy di "allenamento" è l'accesso reale al tastierino
 * (`AccessEvent.eventType = 'KEYPAD_UNLOCK'`). DOOR_OPEN (apertura da staff) ed
 * ENTRY_SIMULATION sono esclusi.
 */

export type LabelValue = { label: string; value: number };

export type GymStats = {
  generatedAt: string;
  rangeDays: number;
  members: {
    total: number;
    active: number;
    newThisMonth: number;
    renewalRatePct: number;
    newPerMonth: LabelValue[]; // ultimi 12 mesi
  };
  usage: {
    accessesRange: number;
    accessesLast7: number;
    accessesLast30: number;
    avgPerDay: number;
    avgPerActiveMemberWeek: number;
    avgDaysBetween: number;
    inactive30: number;
    perDay: LabelValue[]; // ultimi 30 giorni
    byHour: LabelValue[]; // 0..23
    byWeekday: LabelValue[]; // Lun..Dom
    /** Affluenza per giorno×ora: 7 righe (Lun..Dom) × 24 colonne (0..23). */
    heatmap: number[][];
    /** Fascia di picco, es. "Mer 18–20" (null se nessun accesso). */
    peakLabel: string | null;
  };
  retention: {
    avgDurationDays: number;
    churnRatePct: number;
    autoRenewPct: number;
    avgDaysToCancel: number;
  };
};

const MONTH_LABELS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

// Colonna DateTime UTC → orario a muro Europe/Rome (vedi nota in testa al file).
const rome = (col: string) => Prisma.raw(`("${col}" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Rome'`);

function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export async function computeGymStats(
  db: PrismaClient,
  opts: { rangeDays?: number } = {}
): Promise<GymStats> {
  const rangeDays = Math.min(Math.max(opts.rangeDays ?? 90, 7), 365);
  const now = new Date();

  const [
    totalMembers,
    activeMembers,
    newThisMonth,
    inactive30,
    accessesRange,
    accessesLast7,
    accessesLast30,
    newPerMonthRows,
    perDayRows,
    heatmapRows,
    gapRow,
    paymentGroups,
    activeSubsCount,
    autoRenewCount,
    durationRow,
    cancelRow,
    churnedRow
  ] = await Promise.all([
    // Totale iscritti
    db.user.count({ where: { role: "SUBSCRIBER" } }),

    // Iscritti attivi (abbonamento attivo OPPURE pacchetto ingressi attivo)
    db.$queryRaw<{ c: number }[]>(Prisma.sql`
      SELECT count(*)::int AS c FROM "User" u
      WHERE u."role" = 'SUBSCRIBER' AND (
        EXISTS (SELECT 1 FROM "UserSubscription" s
          WHERE s."userId" = u.id AND s."deactivatedAt" IS NULL
            AND s."startsAt" <= (now() AT TIME ZONE 'UTC') AND s."endsAt" >= (now() AT TIME ZONE 'UTC'))
        OR EXISTS (SELECT 1 FROM "UserEntryPackage" e
          WHERE e."userId" = u.id AND e."deactivatedAt" IS NULL AND e."remainingEntries" > 0)
      )`),

    // Nuovi iscritti nel mese corrente (Europe/Rome)
    db.$queryRaw<{ c: number }[]>(Prisma.sql`
      SELECT count(*)::int AS c FROM "User"
      WHERE "role" = 'SUBSCRIBER'
        AND date_trunc('month', ${rome("createdAt")})
            = date_trunc('month', (now() AT TIME ZONE 'Europe/Rome'))`),

    // Iscritti attivi senza alcun accesso negli ultimi 30 giorni
    db.$queryRaw<{ c: number }[]>(Prisma.sql`
      SELECT count(*)::int AS c FROM "User" u
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
            AND a."occurredAt" >= (now() AT TIME ZONE 'UTC') - interval '30 days')`),

    // Accessi (KEYPAD_UNLOCK) nel periodo selezionato
    db.accessEvent.count({
      where: {
        eventType: "KEYPAD_UNLOCK",
        occurredAt: { gte: new Date(now.getTime() - rangeDays * 86400000) }
      }
    }),
    db.accessEvent.count({
      where: { eventType: "KEYPAD_UNLOCK", occurredAt: { gte: new Date(now.getTime() - 7 * 86400000) } }
    }),
    db.accessEvent.count({
      where: { eventType: "KEYPAD_UNLOCK", occurredAt: { gte: new Date(now.getTime() - 30 * 86400000) } }
    }),

    // Nuovi iscritti per mese (ultimi 12 mesi, Europe/Rome)
    db.$queryRaw<{ ym: string; c: number }[]>(Prisma.sql`
      SELECT to_char(date_trunc('month', ${rome("createdAt")}), 'YYYY-MM') AS ym, count(*)::int AS c
      FROM "User"
      WHERE "role" = 'SUBSCRIBER'
        AND ${rome("createdAt")} >= date_trunc('month', (now() AT TIME ZONE 'Europe/Rome')) - interval '11 months'
      GROUP BY 1 ORDER BY 1`),

    // Accessi per giorno (ultimi 30 giorni, Europe/Rome)
    db.$queryRaw<{ d: string; c: number }[]>(Prisma.sql`
      SELECT to_char(date_trunc('day', ${rome("occurredAt")}), 'YYYY-MM-DD') AS d, count(*)::int AS c
      FROM "AccessEvent"
      WHERE "eventType" = 'KEYPAD_UNLOCK'
        AND "occurredAt" >= (now() AT TIME ZONE 'UTC') - interval '30 days'
      GROUP BY 1 ORDER BY 1`),

    // Affluenza giorno×ora (dow 0=Dom..6=Sab, hour 0..23, Europe/Rome) sul periodo.
    // Da questa deriviamo anche fasce orarie (somma sui giorni) e giorni piu'
    // affollati (somma sulle ore), senza query extra.
    db.$queryRaw<{ dow: number; h: number; c: number }[]>(Prisma.sql`
      SELECT EXTRACT(dow FROM ${rome("occurredAt")})::int AS dow,
             EXTRACT(hour FROM ${rome("occurredAt")})::int AS h,
             count(*)::int AS c
      FROM "AccessEvent"
      WHERE "eventType" = 'KEYPAD_UNLOCK'
        AND "occurredAt" >= (now() AT TIME ZONE 'UTC') - ${`${rangeDays} days`}::interval
      GROUP BY 1, 2`),

    // Giorni medi tra un accesso e l'altro (per iscritto, poi media) — su giorni
    // di calendario distinti (Roma), solo chi ha ≥2 giornate di accesso.
    db.$queryRaw<{ avg_gap: number | null }[]>(Prisma.sql`
      WITH days AS (
        SELECT "userId", date_trunc('day', ${rome("occurredAt")}) AS d
        FROM "AccessEvent"
        WHERE "eventType" = 'KEYPAD_UNLOCK'
          AND "occurredAt" >= (now() AT TIME ZONE 'UTC') - ${`${rangeDays} days`}::interval
        GROUP BY "userId", d
      ),
      agg AS (
        SELECT "userId", count(*) AS n, (max(d) - min(d)) AS span
        FROM days GROUP BY "userId" HAVING count(*) >= 2
      )
      SELECT avg(EXTRACT(epoch FROM span) / 86400.0 / (n - 1))::float AS avg_gap FROM agg`),

    // Pagamenti PAID per utente → tasso di rinnovo (≥2 pagamenti = ha rinnovato)
    db.payment.groupBy({
      by: ["userId"],
      where: { status: "PAID" },
      _count: { _all: true }
    }),

    // Abbonamenti attivi (denominatore per autoRenew%)
    db.$queryRaw<{ c: number }[]>(Prisma.sql`
      SELECT count(*)::int AS c FROM "UserSubscription"
      WHERE "deactivatedAt" IS NULL
        AND "startsAt" <= (now() AT TIME ZONE 'UTC') AND "endsAt" >= (now() AT TIME ZONE 'UTC')`),

    db.$queryRaw<{ c: number }[]>(Prisma.sql`
      SELECT count(*)::int AS c FROM "UserSubscription"
      WHERE "deactivatedAt" IS NULL AND "autoRenew" = true
        AND "startsAt" <= (now() AT TIME ZONE 'UTC') AND "endsAt" >= (now() AT TIME ZONE 'UTC')`),

    // Durata media abbonamento (endsAt - startsAt), in giorni
    db.$queryRaw<{ avg_days: number | null }[]>(Prisma.sql`
      SELECT avg(EXTRACT(epoch FROM ("endsAt" - "startsAt")) / 86400.0)::float AS avg_days
      FROM "UserSubscription"`),

    // Tempo medio prima della disdetta (canceledAt - startsAt), in giorni
    db.$queryRaw<{ avg_days: number | null }[]>(Prisma.sql`
      SELECT avg(EXTRACT(epoch FROM ("canceledAt" - "startsAt")) / 86400.0)::float AS avg_days
      FROM "UserSubscription" WHERE "canceledAt" IS NOT NULL`),

    // Abbandoni nel periodo: disdette esplicite (canceledAt nel periodo) OPPURE
    // copertura scaduta e non rinnovata nel periodo (endsAt passato, non riattivato).
    db.$queryRaw<{ c: number }[]>(Prisma.sql`
      SELECT count(*)::int AS c FROM "UserSubscription"
      WHERE (
        ("canceledAt" IS NOT NULL AND "canceledAt" >= (now() AT TIME ZONE 'UTC') - ${`${rangeDays} days`}::interval)
        OR (
          "canceledAt" IS NULL AND "deactivatedAt" IS NULL
          AND "endsAt" < (now() AT TIME ZONE 'UTC')
          AND "endsAt" >= (now() AT TIME ZONE 'UTC') - ${`${rangeDays} days`}::interval
        )
      )`)
  ]);

  // ---- derive ----
  const active = activeMembers[0]?.c ?? 0;
  const activeSubs = activeSubsCount[0]?.c ?? 0;
  const churnedInPeriod = churnedRow[0]?.c ?? 0;

  // Nuovi/mese: scheletro 12 mesi con zeri, riempito dalle righe.
  const newPerMonth: LabelValue[] = [];
  const monthMap = new Map(newPerMonthRows.map((r) => [r.ym, r.c]));
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    newPerMonth.push({ label: MONTH_LABELS[d.getMonth()] ?? "", value: monthMap.get(ym) ?? 0 });
  }

  // Accessi/giorno: scheletro 30 giorni.
  const perDay: LabelValue[] = [];
  const dayMap = new Map(perDayRows.map((r) => [r.d, r.c]));
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    perDay.push({ label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`, value: dayMap.get(key) ?? 0 });
  }

  // Heatmap 7×24 (Lun..Dom × 0..23) da (dow,hour). dow 0=Dom..6=Sab → riga Lun..Dom.
  const heatmap: number[][] = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const r of heatmapRows) {
    const row = (r.dow + 6) % 7; // Dom(0)→6, Lun(1)→0, ... Sab(6)→5
    if (r.h >= 0 && r.h < 24) heatmap[row]![r.h] = r.c;
  }

  // Fasce orarie 0..23 = somma sui giorni.
  const byHour: LabelValue[] = Array.from({ length: 24 }, (_, h) => ({
    label: String(h).padStart(2, "0"),
    value: heatmap.reduce((s, row) => s + (row[h] ?? 0), 0)
  }));

  // Giorni settimana (Lun..Dom) = somma sulle ore.
  const byWeekday: LabelValue[] = WEEKDAY_LABELS.map((label, idx) => ({
    label,
    value: heatmap[idx]!.reduce((s, v) => s + v, 0)
  }));

  // Fascia di picco (cella con più accessi).
  let peakLabel: string | null = null;
  let peakVal = 0;
  let peakRow = 0;
  let peakHour = 0;
  heatmap.forEach((row, ri) =>
    row.forEach((v, hi) => {
      if (v > peakVal) {
        peakVal = v;
        peakRow = ri;
        peakHour = hi;
      }
    })
  );
  if (peakVal > 0) {
    peakLabel = `${WEEKDAY_LABELS[peakRow]} ${String(peakHour).padStart(2, "0")}–${String((peakHour + 2) % 24).padStart(2, "0")}`;
  }

  // Tasso di rinnovo: fra chi ha pagato almeno una volta, quanti ≥2 volte.
  const payers = paymentGroups.filter((g) => g._count._all >= 1).length;
  const renewers = paymentGroups.filter((g) => g._count._all >= 2).length;
  const renewalRatePct = payers > 0 ? round((renewers / payers) * 100) : 0;

  const weeks = rangeDays / 7;
  const avgPerActiveMemberWeek = active > 0 && weeks > 0 ? round(accessesRange / active / weeks, 2) : 0;
  const avgPerDay = round(accessesLast30 / 30);

  const churnBase = activeSubs + churnedInPeriod;
  const churnRatePct = churnBase > 0 ? round((churnedInPeriod / churnBase) * 100) : 0;
  const autoRenewPct = activeSubs > 0 ? round(((autoRenewCount[0]?.c ?? 0) / activeSubs) * 100) : 0;

  return {
    generatedAt: now.toISOString(),
    rangeDays,
    members: {
      total: totalMembers,
      active,
      newThisMonth: newThisMonth[0]?.c ?? 0,
      renewalRatePct,
      newPerMonth
    },
    usage: {
      accessesRange,
      accessesLast7,
      accessesLast30,
      avgPerDay,
      avgPerActiveMemberWeek,
      avgDaysBetween: round(gapRow[0]?.avg_gap ?? 0),
      inactive30: inactive30[0]?.c ?? 0,
      perDay,
      byHour,
      byWeekday,
      heatmap,
      peakLabel
    },
    retention: {
      avgDurationDays: Math.round(durationRow[0]?.avg_days ?? 0),
      churnRatePct,
      autoRenewPct,
      avgDaysToCancel: Math.round(cancelRow[0]?.avg_days ?? 0)
    }
  };
}
