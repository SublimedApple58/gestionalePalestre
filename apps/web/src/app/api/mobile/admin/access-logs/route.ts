import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { mobileAdminAccessLogsQuerySchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/admin/access-logs?cursor=&limit=20
 * 200: { items: AccessEventRow[], nextCursor: string | null }
 *
 * Cursor-based pagination su `occurredAt DESC`. Cursor = last item's id.
 */
export const GET = withMobileAuth(
  async (request) => {
    const { searchParams } = new URL(request.url);
    const parsed = mobileAdminAccessLogsQuerySchema.safeParse({
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ?? undefined
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_QUERY" }, { status: 400 });
    }

    const limit = parsed.data.limit ?? 20;
    const cursor = parsed.data.cursor;

    const items = await db.accessEvent.findMany({
      orderBy: { occurredAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        eventType: true,
        note: true,
        occurredAt: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true
          }
        }
      }
    });

    const hasMore = items.length > limit;
    const sliced = hasMore ? items.slice(0, limit) : items;

    return NextResponse.json({
      items: sliced.map((it) => ({
        id: it.id,
        eventType: it.eventType,
        note: it.note,
        occurredAt: it.occurredAt.toISOString(),
        user: it.user
      })),
      nextCursor: hasMore ? sliced[sliced.length - 1]!.id : null
    });
  },
  { allowedRoles: [UserRole.ADMIN] }
);
