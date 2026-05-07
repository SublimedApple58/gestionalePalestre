import { AuditAction, db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { logAdminAction } from "@/lib/services/audit-log-service";
import { requestDocumentReuploadByAdmin } from "@/lib/services/document-service";
import { DomainError } from "@/lib/services/errors";
import { mobileAdminDocumentReuploadSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/admin/documents/[id]/reupload
 * Body opzionale: { reason?: string (4..400) }
 * 200: { ok: true }
 */
export const POST = withMobileAuth<{ id: string }>(
  async (request, { params, user }) => {
    let raw: unknown;
    try {
      raw = await request.json().catch(() => ({}));
    } catch {
      raw = {};
    }

    const parsed = mobileAdminDocumentReuploadSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_BODY", issues: parsed.error.flatten() }, { status: 400 });
    }

    const doc = await db.userDocument
      .findUnique({ where: { id: params.id }, select: { userId: true, type: true, side: true } })
      .catch(() => null);

    try {
      await requestDocumentReuploadByAdmin(db, user.role, user.id, {
        documentId: params.id,
        reason: parsed.data.reason
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
        action: AuditAction.DOC_REUPLOAD_REQUESTED,
        payload: {
          documentId: params.id,
          type: doc.type,
          side: doc.side,
          reason: parsed.data.reason ?? null
        }
      });
    }

    return NextResponse.json({ ok: true });
  },
  { allowedRoles: [UserRole.ADMIN] }
);
