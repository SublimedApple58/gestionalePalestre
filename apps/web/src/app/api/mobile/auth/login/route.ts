import { db } from "@gestionale/db";
import { compare } from "bcryptjs";
import { NextResponse, type NextRequest } from "next/server";

import { signMobileAccessToken, signMobileRefreshToken, MOBILE_TOKEN_TTL } from "@/lib/auth/mobile-token";
import { mobileLoginSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/auth/login
 * Body: { email, password }
 * 200: { accessToken, refreshToken, expiresInSeconds, user }
 * 401: { error: "INVALID_CREDENTIALS" }
 *
 * Riusa lo stesso schema bcrypt + Zod del flusso web (apps/web/src/auth.ts),
 * ma emette JWT bearer dedicati al canale mobile (vedi mobile-token.ts).
 */
export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const parsed = mobileLoginSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      passwordHash: true
    }
  });

  if (!user) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  const isValid = await compare(parsed.data.password, user.passwordHash);
  if (!isValid) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  const [accessToken, refreshToken] = await Promise.all([
    signMobileAccessToken({ sub: user.id, email: user.email, role: user.role }),
    signMobileRefreshToken({ sub: user.id })
  ]);

  return NextResponse.json({
    accessToken,
    refreshToken,
    expiresInSeconds: MOBILE_TOKEN_TTL.accessSeconds,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role
    }
  });
}
