import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { clearExercisePhoto } from "@/lib/services/workout-template-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/mobile/workouts/exercises/[id]/photo
 *
 * Rimuove la foto dimostrativa dell'esercizio (azzera photoStorageKey).
 * Idempotente: 204 anche se non c'era nessuna foto. L'oggetto R2 resta per
 * la lifecycle policy.
 */
export const DELETE = withMobileAuth<{ id: string }>(
  async (_request, { params }) => {
    await clearExercisePhoto(db, params.id);
    return new NextResponse(null, { status: 204 });
  },
  { allowedRoles: [UserRole.ADMIN, UserRole.INSTRUCTOR] }
);
