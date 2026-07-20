import { AuditAction, db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { logAdminAction } from "@/lib/services/audit-log-service";
import { DomainError } from "@/lib/services/errors";
import {
  assignEntryPackageByAdmin,
  removeEntryPackageByAdmin
} from "@/lib/services/user-service";
import { mobileAdminUserEntryPackageSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/admin/users/[id]/entry-package
 * Body: { totalEntries }
 * 200: { ok: true, entryPackage: { totalEntries, remainingEntries } }
 * 400 HAS_ACTIVE_SUBSCRIPTION se l'utente ha già un abbonamento attivo.
 */
export const POST = withMobileAuth<{ id: string }>(
  async (request, { params, user }) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }

    const parsed = mobileAdminUserEntryPackageSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_BODY", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    try {
      await assignEntryPackageByAdmin(db, user.role, user.id, {
        targetUserId: params.id,
        totalEntries: parsed.data.totalEntries
      });
    } catch (e) {
      if (e instanceof DomainError) {
        return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
      }
      throw e;
    }

    const fresh = await db.userEntryPackage.findUnique({
      where: { userId: params.id },
      select: { totalEntries: true, remainingEntries: true, deactivatedAt: true, startsAt: true }
    });

    await logAdminAction(db, {
      actorId: user.id,
      targetUserId: params.id,
      action: AuditAction.ENTRY_PACKAGE_ASSIGNED,
      payload: { totalEntries: parsed.data.totalEntries }
    });

    return NextResponse.json({
      ok: true,
      entryPackage: fresh
        ? {
            totalEntries: fresh.totalEntries,
            remainingEntries: fresh.remainingEntries,
            deactivatedAt: fresh.deactivatedAt?.toISOString() ?? null,
            startsAt: fresh.startsAt.toISOString()
          }
        : null
    });
  },
  { allowedRoles: [UserRole.ADMIN] }
);

/**
 * DELETE /api/mobile/admin/users/[id]/entry-package
 * Annulla il pacchetto ingressi dell'utente (no-op se assente).
 */
export const DELETE = withMobileAuth<{ id: string }>(
  async (_request, { params, user }) => {
    try {
      await removeEntryPackageByAdmin(db, user.role, user.id, { targetUserId: params.id });
    } catch (e) {
      if (e instanceof DomainError) {
        return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
      }
      throw e;
    }

    await logAdminAction(db, {
      actorId: user.id,
      targetUserId: params.id,
      action: AuditAction.ENTRY_PACKAGE_REMOVED,
      payload: {}
    });

    return NextResponse.json({ ok: true });
  },
  { allowedRoles: [UserRole.ADMIN] }
);
