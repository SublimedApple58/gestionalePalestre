import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { assignInstructorByAdmin } from "@/lib/services/user-service";
import { DomainError } from "@/lib/services/errors";
import { mobileAdminUserInstructorSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/admin/users/[id]/instructor
 * Body: { instructorId: string | null }
 * 200: { ok: true }
 *
 * `instructorId: null` rimuove l'assegnazione esistente (un solo update).
 * `instructorId: string` assegna riusando la guard del service (ruoli).
 */
export const POST = withMobileAuth<{ id: string }>(
  async (request, { params, user }) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }

    const parsed = mobileAdminUserInstructorSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_BODY", issues: parsed.error.flatten() }, { status: 400 });
    }

    try {
      if (parsed.data.instructorId === null) {
        // Disassegna: la guard del service richiede instructorId valido,
        // quindi gestiamo qui il caso null con update diretto + role check.
        const target = await db.user.findUnique({
          where: { id: params.id },
          select: { role: true }
        });
        if (!target) {
          return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
        }
        await db.user.update({
          where: { id: params.id },
          data: { assignedInstructorId: null }
        });
      } else {
        await assignInstructorByAdmin(db, user.role, {
          subscriberId: params.id,
          instructorId: parsed.data.instructorId
        });
      }
    } catch (e) {
      if (e instanceof DomainError) {
        return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
      }
      throw e;
    }

    return NextResponse.json({ ok: true });
  },
  { allowedRoles: [UserRole.ADMIN] }
);
