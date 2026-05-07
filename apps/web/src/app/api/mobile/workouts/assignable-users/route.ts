import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { DomainError } from "@/lib/services/errors";
import { listAssignableUsers } from "@/lib/services/workout-template-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/workouts/assignable-users
 * 200: { items: User[] }
 *
 * Per admin: tutti gli utenti tranne se stesso.
 * Per instructor: solo i suoi allievi.
 */
export const GET = withMobileAuth(
  async (_request, { user }) => {
    try {
      const items = await listAssignableUsers(db, user.id, user.role);
      return NextResponse.json({ items });
    } catch (e) {
      if (e instanceof DomainError) {
        return NextResponse.json({ error: e.code, message: e.message }, { status: 403 });
      }
      throw e;
    }
  },
  { allowedRoles: [UserRole.ADMIN, UserRole.INSTRUCTOR] }
);
