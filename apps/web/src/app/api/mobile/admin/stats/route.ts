import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { computeGymStats } from "@/lib/services/gym-stats-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/admin/stats?rangeDays=90&asOf=YYYY-MM-DD
 * 200: GymStats (vedi gym-stats-service.ts) — stesse metriche della pagina web
 * `/statistiche`, calcolate dall'unico `computeGymStats`. Admin-only.
 * `asOf` (opzionale) è la data dello snapshot "abbonamenti attivi per tipo".
 */
export const GET = withMobileAuth(
  async (request) => {
    const raw = request.nextUrl.searchParams.get("rangeDays");
    const rangeDays = raw ? Number.parseInt(raw, 10) : undefined;
    const asOfRaw = request.nextUrl.searchParams.get("asOf");
    const asOf =
      asOfRaw && /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw) ? new Date(`${asOfRaw}T12:00:00Z`) : undefined;
    const stats = await computeGymStats(db, {
      rangeDays: Number.isFinite(rangeDays) ? rangeDays : undefined,
      asOf
    });
    return NextResponse.json(stats);
  },
  { allowedRoles: [UserRole.ADMIN] }
);
