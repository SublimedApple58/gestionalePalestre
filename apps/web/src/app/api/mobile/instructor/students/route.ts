import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { getProfilePhotoUrls } from "@/lib/profile-photo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/instructor/students
 * Auth: bearer access token (INSTRUCTOR | ADMIN)
 *
 * INSTRUCTOR vede gli iscritti assegnati a sé.
 * ADMIN, per simmetria, vede TUTTI gli iscritti (utile per testare la UI).
 */
export const GET = withMobileAuth(
  async (_request, { user }) => {
    const where =
      user.role === UserRole.ADMIN
        ? { role: UserRole.SUBSCRIBER }
        : { role: UserRole.SUBSCRIBER, assignedInstructorId: user.id };

    const students = await db.user.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        subscription: { select: { tier: true, endsAt: true } }
      }
    });

    const photoMap = await getProfilePhotoUrls(students.map((s) => s.id));

    return NextResponse.json({
      items: students.map((s) => ({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        email: s.email,
        phoneNumber: s.phoneNumber,
        avatarUrl: photoMap.get(s.id) ?? null,
        subscription: s.subscription
          ? {
              tier: s.subscription.tier,
              endsAt: s.subscription.endsAt.toISOString()
            }
          : null
      }))
    });
  },
  { allowedRoles: [UserRole.INSTRUCTOR, UserRole.ADMIN] }
);
