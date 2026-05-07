import { createHash } from "node:crypto";

import { db, DocumentSide, DocumentStatus, DocumentType } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { getProfilePhotoUrl } from "@/lib/profile-photo";
import { mobileAvatarConfirmSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/me/avatar/confirm
 *
 * Conferma upload appena terminato (PUT su presigned URL). Crea o aggiorna
 * l'unico record UserDocument(PROFILE_PHOTO/SINGLE) per l'utente, in stato
 * APPROVED (foto profilo non richiede review admin).
 *
 * Body: { storageKey, fileName, mimeType, fileSize, sha256 }
 * 200: { avatarUrl }
 */
export const POST = withMobileAuth(async (request, { user }) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = mobileAvatarConfirmSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_BODY", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { storageKey, fileName, mimeType, fileSize } = parsed.data;

  // Sanity check: la storageKey deve appartenere all'utente loggato.
  if (!storageKey.startsWith(`users/${user.id}/documents/${DocumentType.PROFILE_PHOTO}/`)) {
    return NextResponse.json({ error: "STORAGE_KEY_MISMATCH" }, { status: 400 });
  }

  // Per la foto profilo non è necessario un hash dei bytes (non passa per AI
  // pipeline): usiamo un placeholder deterministico basato sulla storageKey,
  // che è già univoca (contiene timestamp). Soddisfa il NotNull dello schema
  // senza richiedere round-trip aggiuntivi.
  const sha256 = createHash("sha256").update(storageKey).digest("hex");

  await db.userDocument.upsert({
    where: {
      userId_type_side: {
        userId: user.id,
        type: DocumentType.PROFILE_PHOTO,
        side: DocumentSide.SINGLE
      }
    },
    create: {
      userId: user.id,
      uploadedById: user.id,
      type: DocumentType.PROFILE_PHOTO,
      side: DocumentSide.SINGLE,
      status: DocumentStatus.APPROVED,
      storageKey,
      fileName,
      fileLabel: "Foto profilo",
      mimeType,
      sizeBytes: fileSize,
      sha256
    },
    update: {
      uploadedById: user.id,
      status: DocumentStatus.APPROVED,
      storageKey,
      fileName,
      mimeType,
      sizeBytes: fileSize,
      sha256,
      uploadedAt: new Date(),
      reviewedById: null,
      reviewedAt: null,
      rejectionReason: null
    }
  });

  const avatarUrl = await getProfilePhotoUrl(user.id).catch(() => null);

  return NextResponse.json({ avatarUrl });
});
