import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import {
  createDocumentDownloadUrl,
  isDocumentStorageConfigured
} from "@/lib/services/document-storage-service";
import { DomainError } from "@/lib/services/errors";
import { setExercisePhoto } from "@/lib/services/workout-template-service";
import { mobileExercisePhotoConfirmSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXERCISE_PHOTO_URL_TTL_SECONDS = 24 * 60 * 60;

/**
 * POST /api/mobile/workouts/exercises/[id]/photo/confirm
 *
 * Conferma l'upload appena terminato (PUT su presigned URL) e collega la
 * storageKey all'esercizio. Ritorna l'URL presigned per visualizzarla subito.
 *
 * Body: { storageKey, fileName, mimeType, fileSize }
 * 200: { photoUrl }
 */
export const POST = withMobileAuth<{ id: string }>(
  async (request, { params }) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }

    const parsed = mobileExercisePhotoConfirmSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_BODY", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { storageKey } = parsed.data;

    // Sanity: la storageKey deve appartenere a questo esercizio.
    if (!storageKey.startsWith(`exercises/${params.id}/photo/`)) {
      return NextResponse.json({ error: "STORAGE_KEY_MISMATCH" }, { status: 400 });
    }

    try {
      await setExercisePhoto(db, params.id, storageKey);
    } catch (e) {
      if (e instanceof DomainError) {
        return NextResponse.json({ error: e.code, message: e.message }, { status: 404 });
      }
      throw e;
    }

    let photoUrl: string | null = null;
    if (isDocumentStorageConfigured()) {
      photoUrl = await createDocumentDownloadUrl({
        storageKey,
        expiresInSeconds: EXERCISE_PHOTO_URL_TTL_SECONDS
      }).catch(() => null);
    }

    return NextResponse.json({ photoUrl });
  },
  { allowedRoles: [UserRole.ADMIN, UserRole.INSTRUCTOR] }
);
