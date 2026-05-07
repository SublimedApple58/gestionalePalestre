import { db } from "@gestionale/db";
import { NextResponse, type NextRequest } from "next/server";

import {
  signMobileAccessToken,
  signMobileRefreshToken,
  verifyMobileRefreshToken,
  MOBILE_TOKEN_TTL
} from "@/lib/auth/mobile-token";
import { mobileRefreshSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/auth/refresh
 * Body: { refreshToken }
 * 200: { accessToken, refreshToken, expiresInSeconds }
 *
 * Idempotente lato client: in caso di 401 sul refresh, l'app deve forzare un
 * nuovo login. Per ora ritorniamo anche un nuovo refresh token (rotation
 * naïve: non invalidiamo i vecchi). Quando aggiungeremo la tabella
 * MobileRefreshToken, qui andrà la revoca dell'old jti.
 */
export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const parsed = mobileRefreshSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  let payload;
  try {
    payload = await verifyMobileRefreshToken(parsed.data.refreshToken);
  } catch {
    return NextResponse.json({ error: "INVALID_REFRESH" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, role: true }
  });

  if (!user) {
    return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 401 });
  }

  const [accessToken, refreshToken] = await Promise.all([
    signMobileAccessToken({ sub: user.id, email: user.email, role: user.role }),
    signMobileRefreshToken({ sub: user.id })
  ]);

  return NextResponse.json({
    accessToken,
    refreshToken,
    expiresInSeconds: MOBILE_TOKEN_TTL.accessSeconds
  });
}
