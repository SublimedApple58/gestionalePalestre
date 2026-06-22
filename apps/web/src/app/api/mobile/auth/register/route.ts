import { db } from "@gestionale/db";
import { NextResponse, type NextRequest } from "next/server";

import { signMobileAccessToken, signMobileRefreshToken, MOBILE_TOKEN_TTL } from "@/lib/auth/mobile-token";
import { DomainError } from "@/lib/services/errors";
import { registerSubscriber } from "@/lib/services/user-service";
import { mobileRegisterSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/auth/register
 * Body: { firstName, lastName, email, password, address?, acceptedTerms: true }
 * 200: { accessToken, refreshToken, expiresInSeconds, user }  (auto-login)
 * 409: { error: "EMAIL_EXISTS" }
 * 400: { error: "INVALID_BODY" }
 *
 * Registrazione nativa per l'app mobile (sostituisce il vecchio link web che
 * causava il rifiuto App Store 2.1a). Riusa `registerSubscriber` che crea il
 * SUBSCRIBER + accessCode + sync PIN Tuya, poi emette gli stessi token del login.
 */
export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const parsed = mobileRegisterSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_BODY", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  let user;
  try {
    user = await registerSubscriber(db, {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email,
      password: parsed.data.password,
      phoneNumber: parsed.data.phoneNumber,
      address: parsed.data.address
    });
  } catch (error) {
    if (error instanceof DomainError && error.code === "EMAIL_EXISTS") {
      return NextResponse.json({ error: "EMAIL_EXISTS" }, { status: 409 });
    }
    console.error("[mobile/register] failed:", error);
    return NextResponse.json({ error: "REGISTRATION_FAILED" }, { status: 500 });
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
