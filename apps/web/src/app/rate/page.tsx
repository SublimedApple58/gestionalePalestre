import { db, InstallmentStatus, UserRole } from "@gestionale/db";
import { redirect } from "next/navigation";

import { FullListShell } from "@/components/dashboard/full-list-shell";
import { OverdueInstallmentsSection } from "@/components/dashboard/overdue-installments-section";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function RatePage() {
  const sessionUser = await requireRole([UserRole.ADMIN]);

  const [currentUser, installments] = await Promise.all([
    db.user.findUnique({
      where: { id: sessionUser.id },
      select: { firstName: true, role: true }
    }),
    db.installment.findMany({
      where: {
        status: { in: [InstallmentStatus.FAILED, InstallmentStatus.SCHEDULED] },
        dueAt: { lte: new Date() },
        plan: { status: "ACTIVE" }
      },
      include: {
        plan: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } }
          }
        }
      },
      orderBy: { dueAt: "asc" },
      take: 500
    })
  ]);

  if (!currentUser) redirect("/login");

  return (
    <FullListShell user={currentUser}>
      <OverdueInstallmentsSection installments={installments} />
    </FullListShell>
  );
}
