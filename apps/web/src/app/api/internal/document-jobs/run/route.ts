import { db } from "@gestionale/db";
import { NextResponse } from "next/server";

import { runDocumentProcessingJobs } from "@/lib/services/document-service";

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

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const summary = await runDocumentProcessingJobs(db);
    return NextResponse.json(summary);
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
