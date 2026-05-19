import { db } from "@gestionale/db";
import { NextResponse } from "next/server";

import { runTuyaPinSyncJob } from "@/lib/services/tuya-pin-sync-job";

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

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const result = await runTuyaPinSyncJob(db);

  console.log("[tuya-pin-sync] Job completed:", JSON.stringify(result));

  return NextResponse.json(result);
}
