import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { recordDoorOpen } from "@/lib/services/access-event-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/admin/door/open
 * Auth: bearer access token (ADMIN | INSTRUCTOR)
 *
 * Apre fisicamente la porta (Tuya) e registra AccessEvent DOOR_OPEN.
 * Riservata allo staff: gli iscritti entrano col PIN al tastierino.
 */
export const POST = withMobileAuth(
  async (_request, { user }) => {
    await recordDoorOpen(db, user.id);
    return NextResponse.json({ ok: true, occurredAt: new Date().toISOString() });
  },
  { allowedRoles: [UserRole.ADMIN, UserRole.INSTRUCTOR] }
);
