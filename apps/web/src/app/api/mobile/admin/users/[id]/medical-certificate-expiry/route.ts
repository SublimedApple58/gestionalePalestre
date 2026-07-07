import { db, DocumentType, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { mobileAdminMedicalCertExpirySchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/admin/users/[id]/medical-certificate-expiry
 * Body: { medicalCertificateExpiresAt: ISO }
 * 200: { ok: true, medicalCertificateExpiresAt: ISO }
 *
 * La scadenza vive sul documento certificato medico, unico per iscritto
 * (@@unique([userId, type, side])). Se non è stato caricato, 404.
 */
export const POST = withMobileAuth<{ id: string }>(
  async (request, { params }) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }

    const parsed = mobileAdminMedicalCertExpirySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_BODY", issues: parsed.error.flatten() }, { status: 400 });
    }

    const cert = await db.userDocument.findFirst({
      where: { userId: params.id, type: DocumentType.MEDICAL_CERTIFICATE },
      select: { id: true }
    });
    if (!cert) {
      return NextResponse.json({ error: "NO_MEDICAL_CERTIFICATE" }, { status: 404 });
    }

    const expiresAt = new Date(parsed.data.medicalCertificateExpiresAt);
    const updated = await db.userDocument.update({
      where: { id: cert.id },
      data: { medicalCertificateExpiresAt: expiresAt },
      select: { medicalCertificateExpiresAt: true }
    });

    return NextResponse.json({
      ok: true,
      medicalCertificateExpiresAt: updated.medicalCertificateExpiresAt?.toISOString() ?? null
    });
  },
  { allowedRoles: [UserRole.ADMIN] }
);
