import { NextResponse } from "next/server";
import { UserRole, db } from "@gestionale/db";

import { auth } from "@/auth";
import { removeMember } from "@/lib/tuya/access-control";

export const runtime = "nodejs";

/** DELETE /api/access/users/:tuyaUserId — remove a PIN from the device */
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
    await removeMember(tuyaUserId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
