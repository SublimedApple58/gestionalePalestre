import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { createDocumentDownloadUrl } from "@/lib/services/document-storage-service";
import { DomainError } from "@/lib/services/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/me/documents/[id]/view
 * Auth: bearer access token (SUBSCRIBER)
 * 200: { url } — presigned GET valido ~5min per visualizzare il proprio documento.
 * 404 se il documento non esiste o non appartiene al chiamante.
 */
export const GET = withMobileAuth<{ id: string }>(
  async (_request, { params, user }) => {
    const doc = await db.userDocument.findUnique({
      where: { id: params.id },
      select: { userId: true, storageKey: true }
    });

    if (!doc || doc.userId !== user.id) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    try {
      const url = await createDocumentDownloadUrl({ storageKey: doc.storageKey });
      return NextResponse.json({ url });
    } catch (error) {
      if (error instanceof DomainError && error.code === "DOCUMENT_STORAGE_NOT_CONFIGURED") {
        return NextResponse.json({ error: error.code }, { status: 503 });
      }
      console.error("[mobile/documents/view] failed:", error);
      return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
    }
  },
  { allowedRoles: [UserRole.SUBSCRIBER] }
);
