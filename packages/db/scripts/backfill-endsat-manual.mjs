// Backfill del flag `UserSubscription.endsAtManual` per chi ha OGGI una
// scadenza impostata a mano dalla reception (es. mesi residui "rottamati"),
// inclusi i 4 ripristinati il 22/10/2026.
//
// Regole:
//  - candidato = ultima modifica di data manuale SUBSCRIPTION_DATE_CHANGED
//    (actorId ≠ null) o ripristino documentato (payload.restoredFromAuditId) la
//    cui `after.endsAt` coincide con l'`endsAt` attuale (±60s) e con lo stesso
//    `startsAt`, e che differisce dallo standard del piano di oltre 1 giorno;
//  - abbonamenti già scaduti esclusi (il flag non servirebbe più);
//  - NON modifica mai `endsAt`: scrive solo il flag + audit;
//  - DRY-RUN di default (solo letture). `--apply` richiede la migrazione
//    20261022120000_subscription_manual_endsat_and_arrears già applicata.
//
// Uso (da packages/db):  node scripts/backfill-endsat-manual.mjs [--apply]
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const envVal = (n) => {
  const m = envText.match(new RegExp(`^${n}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
};
const prisma = new PrismaClient({ datasources: { db: { url: envVal("DATABASE_URL") } } });
const APPLY = process.argv.includes("--apply");

const TIER_MONTHS = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12, BIENNIAL: 24 };
const DAY = 24 * 3600_000;
const addMonths = (d, n) =>
  new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth() + n,
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds()
    )
  );
const day = (d) => new Date(d).toISOString().slice(0, 10);

try {
  const subs = await prisma.userSubscription.findMany({
    select: { userId: true, tier: true, startsAt: true, endsAt: true, user: { select: { firstName: true, lastName: true } } }
  });
  const audits = await prisma.userAuditLog.findMany({
    where: { action: "SUBSCRIPTION_DATE_CHANGED" },
    orderBy: { createdAt: "desc" },
    select: { targetUserId: true, actorId: true, payload: true, createdAt: true, actor: { select: { firstName: true } } }
  });
  const latestByUser = new Map();
  for (const a of audits) {
    if (!a.targetUserId || latestByUser.has(a.targetUserId)) continue;
    const manual = a.actorId != null || a.payload?.restoredFromAuditId;
    if (manual && a.payload?.after?.endsAt) latestByUser.set(a.targetUserId, a);
  }

  const rows = [];
  for (const s of subs) {
    if (!(s.tier in TIER_MONTHS)) continue; // DAILY escluso
    if (s.endsAt.getTime() < Date.now()) continue; // già scaduto
    const a = latestByUser.get(s.userId);
    if (!a) continue;
    const sameEnd = Math.abs(new Date(a.payload.after.endsAt) - s.endsAt) <= 60_000;
    const sameStart =
      !a.payload.after.startsAt || Math.abs(new Date(a.payload.after.startsAt) - s.startsAt) <= 60_000;
    if (!sameEnd || !sameStart) continue;
    const diffDays = Math.round((s.endsAt - addMonths(s.startsAt, TIER_MONTHS[s.tier])) / DAY) || 0;
    if (Math.abs(diffDays) <= 1) continue; // uguale allo standard: non è personalizzata
    rows.push({
      userId: s.userId,
      name: `${s.user.firstName} ${s.user.lastName}`,
      tier: s.tier,
      endsAt: s.endsAt,
      diffDays,
      source: `${day(a.createdAt)}${a.actor ? ` (${a.actor.firstName})` : a.payload?.restoredFromAuditId ? " (ripristino)" : ""}`
    });
  }

  rows.sort((x, y) => y.diffDays - x.diffDays);
  for (const r of rows) {
    console.log(
      `${r.name.padEnd(26)} ${r.tier.padEnd(9)} scadenza ${day(r.endsAt)}  ${(r.diffDays > 0 ? "+" : "") + r.diffDays}gg sullo standard  | modifica manuale del ${r.source}`
    );
  }
  const pos = rows.filter((r) => r.diffDays > 0).length;
  console.log(
    `\n${rows.length} abbonamenti da marcare endsAtManual (${pos} allungati, ${rows.length - pos} accorciati a mano).`
  );

  if (!APPLY) {
    console.log("DRY-RUN: nessuna scrittura. Rilancia con --apply dopo la migrazione e l'OK.");
  } else {
    let done = 0;
    for (const r of rows) {
      await prisma.$transaction(async (tx) => {
        await tx.userSubscription.update({ where: { userId: r.userId }, data: { endsAtManual: true } });
        await tx.userAuditLog.create({
          data: {
            targetUserId: r.userId,
            actorId: null,
            action: "SUBSCRIPTION_AUTO_UPDATED",
            payload: {
              source: "backfill:endsAtManual",
              before: { endsAtManual: false },
              after: { endsAt: r.endsAt.toISOString(), endsAtManual: true },
              reason:
                "Scadenza impostata a mano dalla reception: marcata come intoccabile dai ricalcoli (endsAt invariato)"
            }
          }
        });
      });
      done++;
    }
    console.log(`APPLY: ${done} abbonamenti marcati (endsAt invariato).`);
  }
} finally {
  await prisma.$disconnect();
}
