import { db } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { getPolicyByKey } from "@/lib/policies";
import { mobileAcceptPolicySchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/me/policies/accept
 * Body: { key: string }
 * 200: { ok: true }
 *
 * Registra l'accettazione di una policy obbligatoria per l'utente loggato, alla
 * versione corrente. Idempotente (upsert su userId+policyKey). Sblocca il gate
 * bloccante generico lato mobile.
 */
export const POST = withMobileAuth(async (request, { user }) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = mobileAcceptPolicySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_BODY", issues: parsed.error.flatten() }, { status: 400 });
  }

  const policy = getPolicyByKey(parsed.data.key);
  if (!policy) {
    return NextResponse.json({ error: "UNKNOWN_POLICY" }, { status: 404 });
  }

  await db.policyAcceptance.upsert({
    where: { userId_policyKey: { userId: user.id, policyKey: policy.key } },
    create: { userId: user.id, policyKey: policy.key, version: policy.version },
    update: { version: policy.version, acceptedAt: new Date() }
  });

  return NextResponse.json({ ok: true });
});
