import { AuditAction, db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { logAdminAction } from "@/lib/services/audit-log-service";
import { mobileAdminUserAddressSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/admin/users/[id]/address
 * Body: { address: string | "" | null }
 * 200: { ok: true, address: string | null }
 *
 * Stringa vuota o null → rimuove l'indirizzo (set a null).
 */
export const POST = withMobileAuth<{ id: string }>(
  async (request, { params, user }) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }

    const parsed = mobileAdminUserAddressSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_BODY", issues: parsed.error.flatten() }, { status: 400 });
    }

    const trimmed = parsed.data.address?.trim() ?? null;
    const next = trimmed && trimmed.length > 0 ? trimmed : null;

    const before = await db.user
      .findUnique({ where: { id: params.id }, select: { address: true } })
      .catch(() => null);

    const updated = await db.user.update({
      where: { id: params.id },
      data: { address: next },
      select: { address: true }
    });

    await logAdminAction(db, {
      actorId: user.id,
      targetUserId: params.id,
      action: AuditAction.ADDRESS_UPDATED,
      payload: { before: { address: before?.address ?? null }, after: { address: next } }
    });

    return NextResponse.json({ ok: true, address: updated.address });
  },
  { allowedRoles: [UserRole.ADMIN] }
);
