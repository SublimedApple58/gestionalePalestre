import { AuditAction, db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { logAdminAction } from "@/lib/services/audit-log-service";
import { updateUserRoleByAdmin } from "@/lib/services/user-service";
import { DomainError } from "@/lib/services/errors";
import { mobileAdminUserRoleSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/admin/users/[id]/role
 * Body: { role }
 * 200: { ok: true }
 */
export const POST = withMobileAuth<{ id: string }>(
  async (request, { params, user }) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }

    const parsed = mobileAdminUserRoleSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_BODY", issues: parsed.error.flatten() }, { status: 400 });
    }

    const before = await db.user
      .findUnique({ where: { id: params.id }, select: { role: true } })
      .catch(() => null);

    try {
      await updateUserRoleByAdmin(db, user.role, {
        targetUserId: params.id,
        role: parsed.data.role
      });
    } catch (e) {
      if (e instanceof DomainError) {
        return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
      }
      throw e;
    }

    await logAdminAction(db, {
      actorId: user.id,
      targetUserId: params.id,
      action: AuditAction.ROLE_CHANGED,
      payload: { before: { role: before?.role ?? null }, after: { role: parsed.data.role } }
    });

    return NextResponse.json({ ok: true });
  },
  { allowedRoles: [UserRole.ADMIN] }
);
