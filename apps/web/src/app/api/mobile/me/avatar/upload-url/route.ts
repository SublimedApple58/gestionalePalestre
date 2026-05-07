import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import {
  buildDocumentStorageKey,
  createDocumentUploadUrl,
  isDocumentStorageConfigured
} from "@/lib/services/document-storage-service";
import { mobileAvatarUploadUrlSchema } from "@/lib/validators/mobile";
import { DocumentSide, DocumentType } from "@gestionale/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/me/avatar/upload-url
 *
 * Genera URL S3 presigned (PUT) per upload diretto della foto profilo dal mobile.
 * Body: { fileName, mimeType, fileSize }
 * 200: { uploadUrl, storageKey, expiresInSeconds }
 *
 * Il client poi:
 *  1) PUT direttamente sull'uploadUrl con header Content-Type = mimeType
 *  2) chiama POST /confirm con storageKey + sha256
 */
export const POST = withMobileAuth(async (request, { user }) => {
  if (!isDocumentStorageConfigured()) {
    return NextResponse.json({ error: "STORAGE_NOT_CONFIGURED" }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = mobileAvatarUploadUrlSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_BODY", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { fileName, mimeType } = parsed.data;
  const expiresInSeconds = 300;

  const storageKey = buildDocumentStorageKey(
    user.id,
    DocumentType.PROFILE_PHOTO,
    DocumentSide.SINGLE,
    fileName
  );

  const uploadUrl = await createDocumentUploadUrl({
    storageKey,
    contentType: mimeType,
    expiresInSeconds
  });

  return NextResponse.json({ uploadUrl, storageKey, expiresInSeconds });
});
