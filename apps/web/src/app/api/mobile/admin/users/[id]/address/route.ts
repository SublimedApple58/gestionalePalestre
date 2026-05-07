import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
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
  async (request, { params }) => {
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

    const updated = await db.user.update({
      where: { id: params.id },
      data: { address: next },
      select: { address: true }
    });

    return NextResponse.json({ ok: true, address: updated.address });
  },
  { allowedRoles: [UserRole.ADMIN] }
);
