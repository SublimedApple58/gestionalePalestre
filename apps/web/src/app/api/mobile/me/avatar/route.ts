import { db, DocumentSide, DocumentType } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/mobile/me/avatar
 *
 * Rimuove la foto profilo corrente. Cancelliamo solo il record UserDocument:
 * l'oggetto S3 viene lasciato (non critico, lifecycle policy del bucket può
 * occuparsi del cleanup). 204 anche se il record non esiste (idempotente).
 */
export const DELETE = withMobileAuth(async (_request, { user }) => {
  await db.userDocument
    .delete({
      where: {
        userId_type_side: {
          userId: user.id,
          type: DocumentType.PROFILE_PHOTO,
          side: DocumentSide.SINGLE
        }
      }
    })
    .catch(() => null);

  return new NextResponse(null, { status: 204 });
});
