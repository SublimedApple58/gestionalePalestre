import { AuditAction, db, UserRole } from "@gestionale/db";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { logAdminAction } from "@/lib/services/audit-log-service";
import { deleteDocumentByAdmin } from "@/lib/services/document-service";
import { DomainError } from "@/lib/services/errors";
import { getSessionUser } from "@/lib/session";
import { adminDeleteDocumentSchema } from "@/lib/validators/forms";

export const runtime = "nodejs";

/** POST /api/documents/admin/delete — rimozione documento (DB + R2) (solo admin). */
export async function POST(request: Request) {
  const actor = await getSessionUser();
  if (!actor) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (actor.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = adminDeleteDocumentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    const removed = await deleteDocumentByAdmin(db, actor.role, actor.id, {
      documentId: parsed.data.documentId
    });

    await logAdminAction(db, {
      actorId: actor.id,
      targetUserId: removed.userId,
      action: AuditAction.DOC_DELETED,
      payload: { documentId: parsed.data.documentId, type: removed.type, side: removed.side }
    });

    revalidatePath("/utenti");
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DomainError) {
      const status = error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    console.error("[admin/documents/delete] failed:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
