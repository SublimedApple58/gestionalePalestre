import { db } from "@gestionale/db";
import { NextResponse, type NextRequest } from "next/server";

import { requestPasswordReset } from "@/lib/services/password-reset-service";
import { mobileForgotPasswordSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/auth/forgot-password
 * Body: { email }
 * 200: { ok: true } — SEMPRE (anti-enumerazione: non rivela se l'email esiste).
 *
 * Genera e invia un codice OTP a 6 cifre via email (vedi password-reset-service).
 */
export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const parsed = mobileForgotPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  await requestPasswordReset(db, parsed.data.email);

  return NextResponse.json({ ok: true });
}
