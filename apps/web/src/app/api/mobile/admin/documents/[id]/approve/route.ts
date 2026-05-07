import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { approveDocumentByAdmin } from "@/lib/services/document-service";
import { DomainError } from "@/lib/services/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/admin/documents/[id]/approve
 * Body opzionale: { medicalCertificateExpiresAt?: ISO }
 * 200: { ok: true }
 */
export const POST = withMobileAuth<{ id: string }>(
  async (request, { params, user }) => {
    let body: { medicalCertificateExpiresAt?: string } = {};
    try {
      body = (await request.json().catch(() => ({}))) as typeof body;
    } catch {
      body = {};
    }

    try {
      await approveDocumentByAdmin(db, user.role, user.id, {
        documentId: params.id,
        medicalCertificateExpiresAt: body.medicalCertificateExpiresAt
          ? new Date(body.medicalCertificateExpiresAt)
          : undefined
      });
    } catch (e) {
      if (e instanceof DomainError) {
        return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
      }
      throw e;
    }

    return NextResponse.json({ ok: true });
  },
  { allowedRoles: [UserRole.ADMIN] }
);
