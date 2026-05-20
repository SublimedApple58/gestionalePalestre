import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { createDocumentDownloadUrl } from "@/lib/services/document-storage-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/admin/documents/[id]/view
 * 200: { url: string }
 *
 * Ritorna un presigned URL (valido 5 min) per visualizzare un documento.
 */
export const GET = withMobileAuth<{ id: string }>(
  async (_request, { params }) => {
    const document = await db.userDocument.findUnique({
      where: { id: params.id },
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
  },
  { allowedRoles: [UserRole.ADMIN] }
);
