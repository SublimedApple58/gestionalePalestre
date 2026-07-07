import { db, DocumentStatus, DocumentType, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/admin/certificates/expiring
 * 200: { items: { id, firstName, lastName, medicalCertificateExpiresAt }[] }
 *
 * Iscritti con certificato medico APPROVED in scadenza entro 30 giorni oppure
 * già scaduto. La scadenza vive sul documento (unico per iscritto). Ordinati
 * dalla scadenza più imminente. Alimenta l'avviso "Certificati in scadenza"
 * nella home admin.
 */
export const GET = withMobileAuth(
  async () => {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + 30);

    const docs = await db.userDocument.findMany({
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
      take: 100
    });

    return NextResponse.json({
      items: docs.map((d) => ({
        id: d.user.id,
        firstName: d.user.firstName,
        lastName: d.user.lastName,
        medicalCertificateExpiresAt: d.medicalCertificateExpiresAt!.toISOString()
      }))
    });
  },
  { allowedRoles: [UserRole.ADMIN] }
);
