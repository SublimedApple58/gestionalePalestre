import { AuditAction, db, UserRole } from "@gestionale/db";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { logAdminAction } from "@/lib/services/audit-log-service";
import { commitDocumentForUserByAdmin } from "@/lib/services/document-service";
import { DomainError } from "@/lib/services/errors";
import { getSessionUser } from "@/lib/session";
import { adminCommitDocumentSchema } from "@/lib/validators/forms";

export const runtime = "nodejs";

/** POST /api/documents/admin/commit — commit (APPROVED) di un documento per conto di un utente (solo admin). */
export async function POST(request: Request) {
  const actor = await getSessionUser();
  if (!actor) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (actor.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = adminCommitDocumentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    const result = await commitDocumentForUserByAdmin(db, actor.role, actor.id, {
      targetUserId: parsed.data.targetUserId,
      type: parsed.data.type,
      side: parsed.data.side,
      storageKey: parsed.data.storageKey,
      fileName: parsed.data.fileName,
      contentType: parsed.data.contentType,
      sizeBytes: parsed.data.sizeBytes,
      sha256: parsed.data.sha256,
      medicalCertificateExpiresAt: parsed.data.medicalCertificateExpiresAt ?? null
    });

    await logAdminAction(db, {
      actorId: actor.id,
      targetUserId: parsed.data.targetUserId,
      action: AuditAction.DOC_ADMIN_UPLOADED,
      payload: { type: parsed.data.type, side: parsed.data.side, fileName: parsed.data.fileName }
    });

    revalidatePath("/utenti");
    return NextResponse.json({ ok: true, id: result.id, status: result.status });
  } catch (error) {
    if (error instanceof DomainError) {
      const status = error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    console.error("[admin/documents/commit] failed:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
