import { db, DocumentStatus, DocumentType, UserRole } from "@gestionale/db";
import { redirect } from "next/navigation";

import { CertificateExpiringSection } from "@/components/dashboard/certificate-expiring-section";
import { FullListShell } from "@/components/dashboard/full-list-shell";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CertificatiPage() {
  const sessionUser = await requireRole([UserRole.ADMIN]);

  const threshold = new Date();
  threshold.setDate(threshold.getDate() + 30);

  const [currentUser, docs] = await Promise.all([
    db.user.findUnique({
      where: { id: sessionUser.id },
      select: { firstName: true, role: true }
    }),
    db.userDocument.findMany({
      where: {
        type: DocumentType.MEDICAL_CERTIFICATE,
        status: DocumentStatus.APPROVED,
        medicalCertificateExpiresAt: { not: null, lte: threshold },
        user: { role: UserRole.SUBSCRIBER }
      },
      select: {
        medicalCertificateExpiresAt: true,
        user: { select: { id: true, firstName: true, lastName: true } }
      },
      orderBy: { medicalCertificateExpiresAt: "asc" },
      take: 500
    })
  ]);

  if (!currentUser) redirect("/login");

  const items = docs.map((d) => ({
    id: d.user.id,
    firstName: d.user.firstName,
    lastName: d.user.lastName,
    medicalCertificateExpiresAt: d.medicalCertificateExpiresAt as Date
  }));

  return (
    <FullListShell user={currentUser}>
      <CertificateExpiringSection items={items} />
    </FullListShell>
  );
}
