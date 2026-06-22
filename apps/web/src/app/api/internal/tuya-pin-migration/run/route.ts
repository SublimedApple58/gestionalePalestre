import { db } from "@gestionale/db";
import { NextResponse } from "next/server";

import { shouldHaveAccess } from "@/lib/access/authorization";
import { ensureTuyaUser, syncPinToKeypad } from "@/lib/services/tuya-pin-service";

export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    return false;
  }

  const bearer = request.headers.get("authorization")?.replace("Bearer ", "")?.trim();
  const headerSecret = request.headers.get("x-cron-secret")?.trim();

  return bearer === expected || headerSecret === expected;
}

const DELAY_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One-shot migration endpoint: registers all existing users on Tuya
 * and enables PINs for those who should have access.
 *
 * Idempotent — safe to re-run.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const users = await db.user.findMany({
    select: {
      id: true,
      role: true,
      tuyaUserId: true,
      tuyaPinActive: true,
      subscription: {
        select: { startsAt: true, endsAt: true, deactivatedAt: true },
      },
    },
  });

  const summary = {
    total: users.length,
    registered: 0,
    pinEnabled: 0,
    skipped: 0,
    errors: [] as string[],
  };

  for (const user of users) {
    try {
      // Step 1: ensure Tuya user exists
      if (!user.tuyaUserId) {
        await ensureTuyaUser(db, user.id);
        summary.registered++;
        await delay(DELAY_MS);
      }

      // Step 2: sync PIN if needed
      const shouldHavePin = shouldHaveAccess(user);

      if (shouldHavePin && !user.tuyaPinActive) {
        await syncPinToKeypad(db, user.id);
        summary.pinEnabled++;
        await delay(DELAY_MS);
      } else {
        summary.skipped++;
      }
    } catch (err) {
      summary.errors.push(`${user.id}: ${(err as Error).message}`);
    }
  }

  console.log("[tuya-pin-migration] Migration completed:", JSON.stringify(summary));

  return NextResponse.json(summary);
}
