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
  searchParams: Promise<{ range?: string }>;
}) {
  const sessionUser = await requireRole([UserRole.ADMIN]);
  const { range } = await searchParams;

  const parsed = Number.parseInt(range ?? "", 10);
  const rangeDays = (ALLOWED_RANGES as readonly number[]).includes(parsed) ? parsed : 90;

  const [currentUser, stats] = await Promise.all([
    db.user.findUnique({ where: { id: sessionUser.id }, select: { firstName: true, role: true } }),
    computeGymStats(db, { rangeDays })
  ]);

  if (!currentUser) redirect("/login");

  return (
    <AuthenticatedShell currentPath="/statistiche" user={currentUser}>
      <StatsView stats={stats} rangeDays={rangeDays} />
    </AuthenticatedShell>
  );
}
