import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { findUsersBornOn } from "@/lib/services/birthday-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/admin/birthdays
 * 200: { today: User[], tomorrow: User[] }
 *
 * Restituisce gli utenti che compiono gli anni oggi e domani (UTC).
 */
export const GET = withMobileAuth(
  async () => {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const [todayUsers, tomorrowUsers] = await Promise.all([
      findUsersBornOn(db, today),
      findUsersBornOn(db, tomorrow)
    ]);

    return NextResponse.json({
      today: todayUsers.map((u) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        dateOfBirth: u.dateOfBirth ? u.dateOfBirth.toISOString() : null
      })),
      tomorrow: tomorrowUsers.map((u) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        dateOfBirth: u.dateOfBirth ? u.dateOfBirth.toISOString() : null
      }))
    });
  },
  { allowedRoles: [UserRole.ADMIN] }
);
