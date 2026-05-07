import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { recordEntrySimulation } from "@/lib/services/access-event-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/instructor/access/simulate
 * Auth: bearer access token (INSTRUCTOR | ADMIN)
 *
 * Registra AccessEvent SIMULATED. ADMIN può simulare lui stesso.
 * Per gli iscritti il flusso passa altrove (ensureSubscriberCanEnter).
 */
export const POST = withMobileAuth(
  async (_request, { user }) => {
    await recordEntrySimulation(db, user.id);
    return NextResponse.json({ ok: true, occurredAt: new Date().toISOString() });
  },
  { allowedRoles: [UserRole.INSTRUCTOR, UserRole.ADMIN] }
);
