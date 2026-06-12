import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import {
  buildExercisePhotoStorageKey,
  createDocumentUploadUrl,
  isDocumentStorageConfigured
} from "@/lib/services/document-storage-service";
import { mobileExercisePhotoUploadUrlSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/workouts/exercises/[id]/photo/upload-url
 *
 * Genera URL R2 presigned (PUT) per upload diretto della foto esercizio.
 * Body: { fileName, mimeType, fileSize }
 * 200: { uploadUrl, storageKey, expiresInSeconds }
 *
 * Il client poi: PUT diretto sull'uploadUrl (Content-Type = mimeType), quindi
 * POST /confirm con la storageKey.
 */
export const POST = withMobileAuth<{ id: string }>(
  async (request, { params }) => {
    if (!isDocumentStorageConfigured()) {
      return NextResponse.json({ error: "STORAGE_NOT_CONFIGURED" }, { status: 503 });
    }

    const exercise = await db.exercise.findUnique({
      where: { id: params.id },
      select: { id: true }
    });
    if (!exercise) {
      return NextResponse.json({ error: "EXERCISE_NOT_FOUND" }, { status: 404 });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }

    const parsed = mobileExercisePhotoUploadUrlSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_BODY", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { fileName, mimeType } = parsed.data;
    const expiresInSeconds = 300;

    const storageKey = buildExercisePhotoStorageKey(params.id, fileName);

    const uploadUrl = await createDocumentUploadUrl({
      storageKey,
      contentType: mimeType,
      expiresInSeconds
    });

    return NextResponse.json({ uploadUrl, storageKey, expiresInSeconds });
  },
  { allowedRoles: [UserRole.ADMIN, UserRole.INSTRUCTOR] }
);
