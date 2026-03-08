import { NextResponse } from "next/server";
import { db, DocumentSide, DocumentStatus, DocumentType, UserRole } from "@gestionale/db";

import { auth } from "@/auth";
import { createDocumentDownloadUrl, isDocumentStorageConfigured } from "@/lib/services/document-storage-service";

export const runtime = "nodejs";

/**
 * GET /api/profile-photo?userId=xxx
 *
 * Returns a presigned URL for the user's profile photo.
 * - No userId param → returns current user's photo
 * - userId param → ADMIN can view any user, INSTRUCTOR can view assigned subscribers
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const targetUserId = searchParams.get("userId") ?? session.user.id;

  // If requesting someone else's photo, check permissions
  if (targetUserId !== session.user.id) {
    const actor = await db.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    if (!actor) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    if (actor.role === UserRole.ADMIN) {
      // Admin can view any user's photo
    } else if (actor.role === UserRole.INSTRUCTOR) {
      // Instructor can only view assigned subscribers' photos
      const isAssigned = await db.user.count({
        where: {
          id: targetUserId,
          assignedInstructorId: session.user.id
        }
      });

      if (isAssigned === 0) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }
    } else {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  }

  if (!isDocumentStorageConfigured()) {
    return NextResponse.json({ url: null });
  }

  // Find profile photo document (approved or uploaded)
  const document = await db.userDocument.findFirst({
    where: {
      userId: targetUserId,
      type: DocumentType.PROFILE_PHOTO,
      side: DocumentSide.SINGLE,
      status: { in: [DocumentStatus.APPROVED, DocumentStatus.UPLOADED] },
      storageKey: { not: "" }
    },
    select: { storageKey: true },
    orderBy: { uploadedAt: "desc" }
  });

  if (!document?.storageKey) {
    return NextResponse.json({ url: null });
  }

  try {
    const url = await createDocumentDownloadUrl({
      storageKey: document.storageKey,
      expiresInSeconds: 3600
    });
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ url: null });
  }
}
