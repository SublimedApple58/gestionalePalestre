import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { DomainError } from "@/lib/services/errors";
import { unassignTemplate } from "@/lib/services/workout-template-service";
import { mobileWorkoutAssignSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/workouts/templates/[id]/unassign
 * Body: { userIds: string[] }
 * 200: { removed: string[] }
 */
export const POST = withMobileAuth<{ id: string }>(
  async (request, { params, user }) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }
    const parsed = mobileWorkoutAssignSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_BODY", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    try {
      const result = await unassignTemplate(db, {
        templateId: params.id,
        userIds: parsed.data.userIds,
        actorId: user.id,
        actorRole: user.role
      });
      return NextResponse.json(result);
    } catch (e) {
      if (e instanceof DomainError) {
        const status =
          e.code === "NOT_FOUND" ? 404 : e.code === "FORBIDDEN" ? 403 : 400;
        return NextResponse.json({ error: e.code, message: e.message }, { status });
      }
      throw e;
    }
  },
  { allowedRoles: [UserRole.ADMIN, UserRole.INSTRUCTOR] }
);
