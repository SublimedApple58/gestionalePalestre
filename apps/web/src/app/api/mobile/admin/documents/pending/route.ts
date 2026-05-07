import { db, DocumentStatus, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import {
  createDocumentDownloadUrl,
  isDocumentStorageConfigured
} from "@/lib/services/document-storage-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/admin/documents/pending
 * 200: { items: PendingDocRow[] }
 *
 * Lista documenti utenti in stato PENDING_ADMIN_REVIEW. Ogni record ha
 * presigned preview URL (5 min, sufficiente per aprire il modal).
 */
export const GET = withMobileAuth(
  async () => {
    const docs = await db.userDocument.findMany({
      where: { status: DocumentStatus.PENDING_ADMIN_REVIEW },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      },
      orderBy: { uploadedAt: "desc" },
      take: 80
    });

    const storageConfigured = isDocumentStorageConfigured();
    const items = await Promise.all(
      docs.map(async (d) => ({
        id: d.id,
        type: d.type,
        side: d.side,
        fileName: d.fileName,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        uploadedAt: d.uploadedAt.toISOString(),
        previewUrl: storageConfigured
          ? await createDocumentDownloadUrl({
              storageKey: d.storageKey,
              expiresInSeconds: 300
            }).catch(() => null)
          : null,
        user: d.user
      }))
    );

    return NextResponse.json({ items });
  },
  { allowedRoles: [UserRole.ADMIN] }
);
