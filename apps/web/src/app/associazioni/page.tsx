import { db, UserRole } from "@gestionale/db";
import { redirect } from "next/navigation";

import { AssociationExpiringSection } from "@/components/dashboard/association-expiring-section";
import { FullListShell } from "@/components/dashboard/full-list-shell";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AssociazioniPage() {
  const sessionUser = await requireRole([UserRole.ADMIN]);

  const threshold = new Date();
  threshold.setDate(threshold.getDate() + 14);

  const [currentUser, users] = await Promise.all([
    db.user.findUnique({
      where: { id: sessionUser.id },
      select: { firstName: true, role: true }
    }),
    db.user.findMany({
      where: {
        associationMember: true,
        associationExpiresAt: { not: null, lte: threshold }
      },
      select: { id: true, firstName: true, lastName: true, associationExpiresAt: true },
      orderBy: { associationExpiresAt: "asc" },
      take: 500
    })
  ]);

  if (!currentUser) redirect("/login");

  const items = users.map((u) => ({
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    associationExpiresAt: u.associationExpiresAt as Date
  }));

  return (
    <FullListShell user={currentUser}>
      <AssociationExpiringSection items={items} />
    </FullListShell>
  );
}
