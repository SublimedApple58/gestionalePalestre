import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { DomainError } from "@/lib/services/errors";
import {
  createCustomExercise,
  listExerciseCatalog
} from "@/lib/services/workout-template-service";
import { mobileCreateExerciseSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/workouts/exercises
 * 200: { items: Exercise[] }
 *
 * Catalogo completo (seed + custom). Lato mobile e' cacheato in SQLite.
 */
export const GET = withMobileAuth(async () => {
  const items = await listExerciseCatalog(db);
  return NextResponse.json({ items });
});

/**
 * POST /api/mobile/workouts/exercises
 * Body: { name, muscleGroup?, equipment?, notes? }
 * 201: { id, name }
 *
 * Crea un esercizio custom (solo admin/instructor — i subscriber dovrebbero
 * usare il catalogo esistente). Se esiste gia' uno con stesso nome (case
 * insensitive), riusiamo quello.
 */
export const POST = withMobileAuth(
  async (request, { user }) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }
    const parsed = mobileCreateExerciseSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_BODY", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    try {
      const created = await createCustomExercise(db, {
        creatorId: user.id,
        name: parsed.data.name,
        muscleGroup: parsed.data.muscleGroup ?? null,
        equipment: parsed.data.equipment ?? null,
        notes: parsed.data.notes ?? null
      });
      return NextResponse.json(created, { status: 201 });
    } catch (e) {
      if (e instanceof DomainError) {
        return NextResponse.json(
          { error: e.code, message: e.message },
          { status: 400 }
        );
      }
      throw e;
    }
  },
  { allowedRoles: [UserRole.ADMIN, UserRole.INSTRUCTOR] }
);
