import { NextResponse } from "next/server";
import { UserRole, db } from "@gestionale/db";

import { auth } from "@/auth";
import { listMembers, addMember } from "@/lib/tuya/access-control";

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

/** GET /api/access/users — list all PINs active on the device */
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const members = await listMembers();
    return NextResponse.json({ members });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

/** POST /api/access/users — add a PIN for a user
 *
 * Body: { user_id: string, name: string, pin_code: string }
 *
 * Returns the Tuya user_id — store it on your User record so you can
 * call DELETE /api/access/users/:tuyaUserId later.
 */
export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = (await request.json()) as {
    user_id:  string;
    name:     string;
    pin_code: string;
  };

  if (!body.user_id || !body.name || !body.pin_code) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }

  if (!/^\d{4,8}$/.test(body.pin_code)) {
    return NextResponse.json(
      { error: "PIN must be 4–8 digits" },
      { status: 422 }
    );
  }

  try {
    const tuyaUserId = await addMember({
      userId:  body.user_id,
      name:    body.name,
      pinCode: body.pin_code,
    });
    return NextResponse.json({ ok: true, tuya_user_id: tuyaUserId });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
