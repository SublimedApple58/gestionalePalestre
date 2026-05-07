import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { rejectDocumentByAdmin } from "@/lib/services/document-service";
import { DomainError } from "@/lib/services/errors";
import { mobileAdminDocumentRejectSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/admin/documents/[id]/reject
 * Body: { reason: string (4..400) }
 * 200: { ok: true }
 */
export const POST = withMobileAuth<{ id: string }>(
  async (request, { params, user }) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }

    const parsed = mobileAdminDocumentRejectSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_BODY", issues: parsed.error.flatten() }, { status: 400 });
    }

    try {
      await rejectDocumentByAdmin(db, user.role, user.id, {
        documentId: params.id,
        rejectionReason: parsed.data.reason
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
