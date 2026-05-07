import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { saveWorkoutPlan } from "@/lib/services/workout-service";
import { mobileWeeklyPlanSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

const ALL_DAYS: DayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
];

function normalizeDay(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function emptyPlan(): Record<DayKey, string | null> {
  return ALL_DAYS.reduce((acc, k) => ({ ...acc, [k]: null }), {} as Record<DayKey, string | null>);
}

/**
 * GET /api/mobile/instructor/weekly-plan
 * 200: { plan: { monday..sunday: string | null } }
 */
export const GET = withMobileAuth(
  async (_request, { user }) => {
    const plan = await db.workoutPlan.findUnique({
      where: { userId: user.id }
    });

    if (!plan) {
      return NextResponse.json({ plan: emptyPlan() });
    }

    return NextResponse.json({
      plan: {
        monday: plan.monday,
        tuesday: plan.tuesday,
        wednesday: plan.wednesday,
        thursday: plan.thursday,
        friday: plan.friday,
        saturday: plan.saturday,
        sunday: plan.sunday
      }
    });
  },
  { allowedRoles: [UserRole.INSTRUCTOR, UserRole.ADMIN] }
);

/**
 * POST /api/mobile/instructor/weekly-plan
 * Body: { monday..sunday: string | null }
 * 200: { plan: { monday..sunday: string | null } }
 */
export const POST = withMobileAuth(
  async (request, { user }) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }

    const parsed = mobileWeeklyPlanSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_BODY", issues: parsed.error.flatten() }, { status: 400 });
    }

    const input = {
      monday: normalizeDay(parsed.data.monday),
      tuesday: normalizeDay(parsed.data.tuesday),
      wednesday: normalizeDay(parsed.data.wednesday),
      thursday: normalizeDay(parsed.data.thursday),
      friday: normalizeDay(parsed.data.friday),
      saturday: normalizeDay(parsed.data.saturday),
      sunday: normalizeDay(parsed.data.sunday)
    };

    await saveWorkoutPlan(db, user.id, input);

    return NextResponse.json({ plan: input });
  },
  { allowedRoles: [UserRole.INSTRUCTOR, UserRole.ADMIN] }
);
