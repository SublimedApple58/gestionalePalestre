import { NextResponse } from "next/server";
import { UserRole, db } from "@gestionale/db";

import { auth } from "@/auth";
import { createDocumentDownloadUrl } from "@/lib/services/document-storage-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const actor = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true }
  });

  if (actor?.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get("documentId");

  if (!documentId) {
    return NextResponse.json({ error: "MISSING_DOCUMENT_ID" }, { status: 400 });
  }

  const document = await db.userDocument.findUnique({
    where: { id: documentId },
    select: { storageKey: true }
  });

  if (!document?.storageKey) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    const url = await createDocumentDownloadUrl({
      storageKey: document.storageKey,
      expiresInSeconds: 300
    });
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ error: "STORAGE_ERROR" }, { status: 500 });
  }
}
