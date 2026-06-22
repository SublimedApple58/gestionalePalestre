import { UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { createDocumentUploadPresign } from "@/lib/services/document-service";
import { DomainError } from "@/lib/services/errors";
import { getSessionUser } from "@/lib/session";
import { adminPresignDocumentSchema } from "@/lib/validators/forms";

export const runtime = "nodejs";

function toStatus(error: DomainError): number {
  switch (error.code) {
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "DOCUMENT_RATE_LIMIT":
      return 429;
    case "DOCUMENT_STORAGE_NOT_CONFIGURED":
      return 503;
    default:
      return 400;
  }
}

/** POST /api/documents/admin/presign — presign upload per conto di un utente (solo admin). */
export async function POST(request: Request) {
  const actor = await getSessionUser();
  if (!actor) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (actor.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = adminPresignDocumentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    const result = await createDocumentUploadPresign({
      userId: parsed.data.targetUserId,
      type: parsed.data.type,
      side: parsed.data.side,
      fileName: parsed.data.fileName,
      contentType: parsed.data.contentType,
      sizeBytes: parsed.data.sizeBytes
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: toStatus(error) });
    }
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
