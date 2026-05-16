import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { DomainError } from "@/lib/services/errors";
import { deleteExercise } from "@/lib/services/workout-template-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/mobile/workouts/exercises/[id]?force=true|false
 * Auth: ADMIN, INSTRUCTOR
 *
 * Flusso "preview then confirm":
 *  - force=false (default): se l'esercizio è in uso in qualche scheda,
 *    risponde 409 con `{ usage: { count, templates: [...] } }` — l'app
 *    mostra la lista e chiede conferma.
 *  - force=true: cascade — rimuove l'esercizio da tutte le schede (e dai
 *    loro set) e poi elimina l'esercizio dal catalogo.
 *
 * Risposte:
 *   200 { deleted: true }                  → eliminato
 *   409 { error, usage: {count, templates} } → conferma necessaria
 *   404 { error }                          → esercizio non esiste
 */
export const DELETE = withMobileAuth<{ id: string }>(
  async (request, { params }) => {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });
    }

    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "true";

    try {
      const result = await deleteExercise(db, id, { force });
      if (!result.deleted) {
        return NextResponse.json(
          {
            error: "EXERCISE_IN_USE",
            message: `Esercizio in uso in ${result.usage.count} scheda/e. Conferma per eliminarlo da tutte.`,
            usage: result.usage
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ deleted: true });
    } catch (e) {
      if (e instanceof DomainError) {
        return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
      }
      // Prisma P2025 = record not found
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code: string }).code === "P2025"
      ) {
        return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
      }
      throw e;
    }
  },
  { allowedRoles: [UserRole.ADMIN, UserRole.INSTRUCTOR] }
);
