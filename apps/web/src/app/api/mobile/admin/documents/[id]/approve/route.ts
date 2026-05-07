import { AuditAction, db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { logAdminAction } from "@/lib/services/audit-log-service";
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

    const doc = await db.userDocument
      .findUnique({ where: { id: params.id }, select: { userId: true, type: true, side: true } })
      .catch(() => null);

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

    if (doc) {
      await logAdminAction(db, {
        actorId: user.id,
        targetUserId: doc.userId,
        action: AuditAction.DOC_APPROVED,
        payload: { documentId: params.id, type: doc.type, side: doc.side }
      });
    }

    return NextResponse.json({ ok: true });
  },
  { allowedRoles: [UserRole.ADMIN] }
);
