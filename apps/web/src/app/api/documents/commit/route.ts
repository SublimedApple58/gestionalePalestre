import { db } from "@gestionale/db";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { commitUploadedDocument } from "@/lib/services/document-service";
import { DomainError } from "@/lib/services/errors";
import { commitDocumentSchema } from "@/lib/validators/forms";

export const runtime = "nodejs";

function toStatusCode(error: DomainError): number {
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

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = commitDocumentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    const result = await commitUploadedDocument(db, {
      userId,
      type: parsed.data.type,
      side: parsed.data.side,
      storageKey: parsed.data.storageKey,
      fileName: parsed.data.fileName,
      contentType: parsed.data.contentType,
      sizeBytes: parsed.data.sizeBytes,
      sha256: parsed.data.sha256,
      medicalCertificateExpiresAt: parsed.data.medicalCertificateExpiresAt ?? null
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: toStatusCode(error) });
    }

    console.error("[commit] unhandled error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
