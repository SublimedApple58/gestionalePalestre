import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { createDocumentUploadPresign } from "@/lib/services/document-service";
import { DomainError } from "@/lib/services/errors";
import { uploadDocumentSchema } from "@/lib/validators/forms";

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
  const parsed = uploadDocumentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    const result = await createDocumentUploadPresign({
      userId,
      type: parsed.data.type,
      side: parsed.data.side,
      fileName: parsed.data.fileName,
      contentType: parsed.data.contentType,
      sizeBytes: parsed.data.sizeBytes
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: toStatusCode(error) });
    }

    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
