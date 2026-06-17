import { db } from "@gestionale/db";
import { NextResponse, type NextRequest } from "next/server";

import { DomainError } from "@/lib/services/errors";
import { resetPasswordWithCode } from "@/lib/services/password-reset-service";
import { mobileResetPasswordSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/auth/reset-password
 * Body: { email, code, newPassword }
 * 200: { ok: true }
 * 422: { error: "INVALID_CODE" | "CODE_EXPIRED" | "TOO_MANY_ATTEMPTS" | "WEAK_PASSWORD" }
 * 400: { error: "INVALID_BODY" }
 */
export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const parsed = mobileResetPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    await resetPasswordWithCode(db, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json({ error: error.code }, { status: 422 });
    }
    console.error("[mobile reset-password] errore inatteso:", error);
    return NextResponse.json({ error: "RESET_FAILED" }, { status: 500 });
  }
}
