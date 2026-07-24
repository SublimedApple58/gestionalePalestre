import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { computeGymStats } from "@/lib/services/gym-stats-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/admin/stats?rangeDays=90
 * 200: GymStats (vedi gym-stats-service.ts) — stesse metriche della pagina web
 * `/statistiche`, calcolate dall'unico `computeGymStats`. Admin-only.
 */
export const GET = withMobileAuth(
  async (request) => {
    const raw = request.nextUrl.searchParams.get("rangeDays");
    const rangeDays = raw ? Number.parseInt(raw, 10) : undefined;
    const stats = await computeGymStats(db, {
      rangeDays: Number.isFinite(rangeDays) ? rangeDays : undefined
    });
    return NextResponse.json(stats);
  },
  { allowedRoles: [UserRole.ADMIN] }
);
