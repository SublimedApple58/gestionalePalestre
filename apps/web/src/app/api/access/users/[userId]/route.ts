import { NextResponse } from "next/server";
import { UserRole, db } from "@gestionale/db";

import { auth } from "@/auth";
import { disablePin, deleteTuyaUser } from "@/lib/tuya/access-control";

export const runtime = "nodejs";

/** DELETE /api/access/users/:userId — remove a user's PIN and Tuya account */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
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

  const { userId: tuyaUserId } = await params;

  try {
    // Find the DB user that has this tuyaUserId to get unlockNo
    const dbUser = await db.user.findFirst({
      where: { tuyaUserId },
      select: { id: true, tuyaPinUnlockNo: true, tuyaPinActive: true },
    });

    // Disable PIN if active
    if (dbUser?.tuyaPinActive && dbUser.tuyaPinUnlockNo) {
      await disablePin(tuyaUserId, dbUser.tuyaPinUnlockNo);
    }

    // Delete Tuya user
    await deleteTuyaUser(tuyaUserId);

    // Clean up DB state
    if (dbUser) {
      await db.user.update({
        where: { id: dbUser.id },
        data: { tuyaUserId: null, tuyaPinUnlockNo: null, tuyaPinActive: false },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
