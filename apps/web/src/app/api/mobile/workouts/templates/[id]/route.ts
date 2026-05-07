import { db } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { DomainError } from "@/lib/services/errors";
import {
  deleteTemplate,
  getTemplateDetail,
  updateTemplate
} from "@/lib/services/workout-template-service";
import { mobileUpdateWorkoutTemplateSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/mobile/workouts/templates/[id] — 200: WorkoutTemplateDetail */
export const GET = withMobileAuth<{ id: string }>(async (_request, { params, user }) => {
  try {
    const detail = await getTemplateDetail(db, params.id, user.id);
    return NextResponse.json(detail);
  } catch (e) {
    if (e instanceof DomainError) {
      const status = e.code === "NOT_FOUND" ? 404 : e.code === "FORBIDDEN" ? 403 : 400;
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    throw e;
  }
});

/** PATCH /api/mobile/workouts/templates/[id] — solo creator, replace pattern */
export const PATCH = withMobileAuth<{ id: string }>(async (request, { params, user }) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const parsed = mobileUpdateWorkoutTemplateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_BODY", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    await updateTemplate(db, {
      templateId: params.id,
      actorId: user.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      daysPerWeek: parsed.data.daysPerWeek,
      sessions: parsed.data.sessions
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DomainError) {
      const status = e.code === "NOT_FOUND" ? 404 : e.code === "FORBIDDEN" ? 403 : 400;
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    throw e;
  }
});

/** DELETE /api/mobile/workouts/templates/[id] — solo creator */
export const DELETE = withMobileAuth<{ id: string }>(async (_request, { params, user }) => {
  try {
    await deleteTemplate(db, params.id, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DomainError) {
      const status = e.code === "NOT_FOUND" ? 404 : e.code === "FORBIDDEN" ? 403 : 400;
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    throw e;
  }
});
