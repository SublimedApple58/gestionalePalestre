import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { DomainError } from "@/lib/services/errors";
import {
  createTemplate,
  listTemplatesForUser
} from "@/lib/services/workout-template-service";
import { mobileCreateWorkoutTemplateSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/workouts/templates
 * 200: { items: WorkoutTemplateSummary[] }
 *
 * Per admin/instructor: schede create + schede ricevute
 * Per subscriber: solo schede ricevute
 */
export const GET = withMobileAuth(async (_request, { user }) => {
  const items = await listTemplatesForUser(db, user.id);
  return NextResponse.json({ items });
});

/**
 * POST /api/mobile/workouts/templates
 * Body: CreateTemplateInput
 * 201: { id }
 *
 * Solo ADMIN/INSTRUCTOR. Crea template ASSIGNABLE.
 */
export const POST = withMobileAuth(
  async (request, { user }) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }
    const parsed = mobileCreateWorkoutTemplateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_BODY", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    try {
      const created = await createTemplate(
        db,
        {
          creatorId: user.id,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          daysPerWeek: parsed.data.daysPerWeek,
          sessions: parsed.data.sessions
        },
        user.role
      );
      return NextResponse.json({ id: created.id }, { status: 201 });
    } catch (e) {
      if (e instanceof DomainError) {
        return NextResponse.json(
          { error: e.code, message: e.message },
          { status: e.code === "FORBIDDEN" ? 403 : 400 }
        );
      }
      throw e;
    }
  },
  { allowedRoles: [UserRole.ADMIN, UserRole.INSTRUCTOR] }
);
