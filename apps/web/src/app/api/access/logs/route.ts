import { NextResponse } from "next/server";
import { UserRole, db } from "@gestionale/db";

import { auth } from "@/auth";
import { getAccessRecords } from "@/lib/tuya/access-control";

export const runtime = "nodejs";

/**
 * GET /api/access/logs
 *
 * Query params (all optional):
 *   start_time  — Unix ms (default: 24h ago)
 *   end_time    — Unix ms (default: now)
 *   page_size   — integer 1–100 (default: 50)
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const actor = await db.user.findUnique({
    where:  { id: session.user.id },
    select: { role: true },
  });

  if (actor?.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const startTime = searchParams.get("start_time");
  const endTime   = searchParams.get("end_time");
  const pageSize  = searchParams.get("page_size");

  try {
    const records = await getAccessRecords({
      startTime: startTime ? Number(startTime) : undefined,
      endTime:   endTime   ? Number(endTime)   : undefined,
      pageSize:  pageSize  ? Math.min(Number(pageSize), 100) : 50,
    });
    return NextResponse.json({ records });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
