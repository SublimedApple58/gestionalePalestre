import { db, InstallmentPlanStatus, InstallmentStatus, PaymentStatus } from "@gestionale/db";
import { NextResponse } from "next/server";

import { cancelSubscription } from "@/lib/payments/revolut";
import { TIER_CATALOG } from "@/lib/subscription";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const bearer = request.headers.get("authorization")?.replace("Bearer ", "")?.trim();
  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  return bearer === expected || headerSecret === expected;
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Importi one-shot dei tier annuale/biennale: se un utente ha un pagamento PAID
// di questo importo NON legato a un piano, ha comprato "tutto insieme" → i suoi
// piani rateali sono spazzatura da eliminare.
const ONE_SHOT_ANNUAL_CENTS = new Set<number>([
  TIER_CATALOG.YEARLY.oneShotCents,
  TIER_CATALOG.BIENNIAL.oneShotCents,
]);

/**
 * PULIZIA piani rateali fantasma/duplicati.
 *
 * Regola di business (definita dall'utente): quasi tutti gli abbonamenti sono
 * pagamenti UNICI (one-shot) e NON devono avere piani/rate. Solo l'annuale e il
 * biennale acquistati "a rate" hanno un piano + subscription Revolut ricorrente.
 * Un utente ha UNA sola UserSubscription ma i checkout ripetuti/abbandonati hanno
 * lasciato PIÙ piani (+ subscription Revolut) a testa → doppi addebiti, rate-
 * fantasma mostrate a chi ha pagato tutto, "scaduti" spurii.
 *
 * Questo job tiene UN SOLO piano per ogni pagante rateale reale ed elimina il
 * resto: cancella la subscription Revolut (stop addebiti), marca il piano CANCELED
 * e chiude il pagamento setup se ancora PENDING (così sparisce da "In attesa").
 *
 *   (default)     → DRY-RUN: ritorna cosa verrebbe cancellato, non tocca nulla.
 *   ?execute=1    → esegue le cancellazioni.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const execute = new URL(request.url).searchParams.get("execute") === "1";

  const plans = await db.installmentPlan.findMany({
    where: { status: { in: [InstallmentPlanStatus.ACTIVE, InstallmentPlanStatus.DEFAULTED] } },
    select: {
      id: true,
      status: true,
      revolutSubscriptionId: true,
      createdAt: true,
      paymentId: true,
      payment: {
        select: {
          userId: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              accessCode: true,
              payments: { select: { amountCents: true, status: true } },
            },
          },
        },
      },
      installments: { select: { status: true } },
    },
  });

  // Raggruppa per utente e decidi quale piano tenere.
  const byUser = new Map<string, typeof plans>();
  for (const pl of plans) {
    const uid = pl.payment.userId;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid)!.push(pl);
  }

  type Row = {
    name: string;
    code: string;
    planId: string;
    subscriptionId: string | null;
    paidInstallments: number;
    reason: string;
  };
  const toCancel: Row[] = [];
  let keepCount = 0;
  const doublePaidWarnings: Row[] = [];

  for (const [, userPlans] of byUser) {
    const first = userPlans[0];
    if (!first) continue;
    const user = first.payment.user;
    const paidOneShot = user.payments.some(
      (p) => p.status === PaymentStatus.PAID && ONE_SHOT_ANNUAL_CENTS.has(p.amountCents)
    );
    const scored = userPlans
      .map((pl) => ({
        pl,
        paid: pl.installments.filter((i) => i.status === InstallmentStatus.PAID).length,
      }))
      .sort((a, b) => b.paid - a.paid || b.pl.createdAt.getTime() - a.pl.createdAt.getTime());
    const anyPaid = scored.some((s) => s.paid > 0);

    let keepId: string | null = null;
    let reason: string;
    if (paidOneShot) {
      reason = "one-shot buyer: cancella tutti i piani";
    } else if (!anyPaid) {
      reason = "mai pagato una rata (abbandonato): cancella tutti";
    } else {
      keepId = scored[0]?.pl.id ?? null;
      reason = "pagante rateale: tieni 1, cancella extra";
    }

    for (const s of scored) {
      if (s.pl.id === keepId) {
        keepCount++;
        continue;
      }
      const row: Row = {
        name: `${user.firstName} ${user.lastName}`,
        code: user.accessCode,
        planId: s.pl.id,
        subscriptionId: s.pl.revolutSubscriptionId,
        paidInstallments: s.paid,
        reason,
      };
      toCancel.push(row);
      if (s.paid > 0) doublePaidWarnings.push(row);
    }
  }

  if (!execute) {
    return NextResponse.json({
      mode: "dry-run",
      plansTotal: plans.length,
      keepCount,
      toCancelCount: toCancel.length,
      withRevolutSub: toCancel.filter((r) => r.subscriptionId).length,
      doublePaidCount: doublePaidWarnings.length,
      doublePaidWarnings,
      toCancel,
    });
  }

  const summary = {
    mode: "execute",
    canceledPlans: 0,
    revolutCanceled: 0,
    revolutErrors: [] as string[],
    paymentsClosed: 0,
  };

  for (const row of toCancel) {
    try {
      if (row.subscriptionId) {
        try {
          await cancelSubscription(row.subscriptionId);
          summary.revolutCanceled++;
        } catch (err) {
          summary.revolutErrors.push(`${row.name} (${row.code}): ${(err as Error).message}`);
        }
      }
      const plan = await db.installmentPlan.update({
        where: { id: row.planId },
        data: { status: InstallmentPlanStatus.CANCELED },
        select: { paymentId: true },
      });
      summary.canceledPlans++;

      // Chiudi il pagamento setup se ancora in attesa (sparisce da "In attesa").
      const closed = await db.payment.updateMany({
        where: { id: plan.paymentId, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.CANCELED, failureReason: "Piano rateale duplicato/fantasma annullato in pulizia" },
      });
      summary.paymentsClosed += closed.count;

      await delay(200);
    } catch (err) {
      summary.revolutErrors.push(`DB ${row.name} (${row.code}): ${(err as Error).message}`);
    }
  }

  return NextResponse.json(summary);
}
