import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { listAuditLogsForUser } from "@/lib/services/audit-log-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/admin/users/[id]/audit-logs?cursor=&limit=
 * 200: { items: AuditLogRow[], nextCursor: string | null }
 *
 * Lista DESC degli eventi audit relativi all'utente target. Cursor-based.
 */
export const GET = withMobileAuth<{ id: string }>(
  async (request, { params }) => {
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor") ?? undefined;
    const rawLimit = searchParams.get("limit");
    const limit = rawLimit ? Math.max(1, Math.min(100, Number.parseInt(rawLimit, 10) || 30)) : 30;

    const result = await listAuditLogsForUser(db, params.id, { cursor, limit });
    return NextResponse.json(result);
  },
  { allowedRoles: [UserRole.ADMIN] }
);
