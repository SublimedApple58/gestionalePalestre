import { NextResponse, type NextRequest } from "next/server";
import { db, UserRole } from "@gestionale/db";

import { auth } from "@/auth";
import { listAuditLogsForUser } from "@/lib/services/audit-log-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/utenti/[id]/audit-logs?cursor=&limit=
 * Auth: NextAuth session (admin only).
 * Equivalente web della rotta mobile, usata dal drawer di gestione utenti.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const me = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true }
  });

  if (!me || me.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor") ?? undefined;
  const rawLimit = searchParams.get("limit");
  const limit = rawLimit ? Math.max(1, Math.min(100, Number.parseInt(rawLimit, 10) || 30)) : 30;

  const result = await listAuditLogsForUser(db, id, { cursor, limit });
  return NextResponse.json(result);
}
