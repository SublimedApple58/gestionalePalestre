import { NextResponse } from "next/server";
import { UserRole, db } from "@gestionale/db";

import { auth } from "@/auth";
import { listTuyaUsers } from "@/lib/tuya/access-control";

export const runtime = "nodejs";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const actor = await db.user.findUnique({
    where:  { id: session.user.id },
    select: { role: true },
  });
  return actor?.role === UserRole.ADMIN ? session : null;
}

/** GET /api/access/users — list all users registered on the Tuya device */
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const users = await listTuyaUsers();
    return NextResponse.json({ users });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
