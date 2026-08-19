import { db, UserRole } from "@gestionale/db";
import { redirect } from "next/navigation";

import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { StatsView } from "@/components/dashboard/stats/stats-view";
import { computeGymStats } from "@/lib/services/gym-stats-service";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const ALLOWED_RANGES = [30, 90, 365] as const;

export default async function StatistichePage({
  searchParams
}: {
  searchParams: Promise<{ range?: string; asOf?: string }>;
}) {
  const sessionUser = await requireRole([UserRole.ADMIN]);
  const { range, asOf } = await searchParams;

  const parsed = Number.parseInt(range ?? "", 10);
  const rangeDays = (ALLOWED_RANGES as readonly number[]).includes(parsed) ? parsed : 90;

  // Snapshot "abbonamenti attivi per tipo": data opzionale (YYYY-MM-DD, default oggi).
  // Interpretata a mezzogiorno UTC per includere gli abbonamenti che iniziano quel giorno.
  const asOfValid = typeof asOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(asOf);
  const asOfDate = asOfValid ? new Date(`${asOf}T12:00:00Z`) : undefined;

  const [currentUser, stats] = await Promise.all([
    db.user.findUnique({ where: { id: sessionUser.id }, select: { firstName: true, role: true } }),
    computeGymStats(db, { rangeDays, asOf: asOfDate })
  ]);

  if (!currentUser) redirect("/login");

  return (
    <AuthenticatedShell currentPath="/statistiche" user={currentUser}>
      <StatsView stats={stats} rangeDays={rangeDays} asOf={asOfValid ? asOf : null} />
    </AuthenticatedShell>
  );
}
