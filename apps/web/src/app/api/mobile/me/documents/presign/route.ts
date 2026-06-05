import { UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { createDocumentUploadPresign } from "@/lib/services/document-service";
import { isDocumentStorageConfigured } from "@/lib/services/document-storage-service";
import { DomainError } from "@/lib/services/errors";
import { mobileDocumentPresignSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

/**
 * POST /api/mobile/me/documents/presign
 * Auth: bearer access token (SUBSCRIBER)
 * Body: { type, side, fileName, mimeType, fileSize }
 * 200: { uploadUrl, storageKey, expiresIn }
 *
 * Riusa createDocumentUploadPresign (slot/mime/size validation + rate-limit).
 * Il client poi fa PUT diretto su uploadUrl (Content-Type = mimeType) e infine
 * chiama /commit.
 */
export const POST = withMobileAuth(
  async (request, { user }) => {
    if (!isDocumentStorageConfigured()) {
      return NextResponse.json({ error: "STORAGE_NOT_CONFIGURED" }, { status: 503 });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }

    const parsed = mobileDocumentPresignSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_BODY", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    try {
      const result = await createDocumentUploadPresign({
        userId: user.id,
        type: parsed.data.type,
        side: parsed.data.side,
        fileName: parsed.data.fileName,
        contentType: parsed.data.mimeType,
        sizeBytes: parsed.data.fileSize
      });

      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof DomainError) {
        return NextResponse.json(
          { error: error.code, message: error.message },
          { status: toStatusCode(error) }
        );
      }
      console.error("[mobile/documents/presign] failed:", error);
      return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
    }
  },
  { allowedRoles: [UserRole.SUBSCRIBER] }
);
