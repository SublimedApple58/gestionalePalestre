import { SignJWT, jwtVerify } from "jose";

import type { UserRole } from "@gestionale/db";

/**
 * Token bearer JWT dedicati al canale mobile (NON le sessioni NextAuth).
 *
 * Usiamo `AUTH_SECRET` (lo stesso di NextAuth) ma con audience separata in modo
 * che un access token mobile non possa mai essere accettato come session
 * cookie del web e viceversa.
 *
 * Schema:
 * - access token: scade in 1h, payload { sub, email, role, aud: "mobile-access" }
 * - refresh token: scade in 60 giorni, payload { sub, aud: "mobile-refresh" }
 *
 * Pattern minimale: niente token rotation né lista di refresh revocati. Quando
 * serviranno (logout-all-devices, kill switch), aggiungeremo una tabella
 * MobileRefreshToken con jti.
 */

export const MOBILE_ACCESS_AUDIENCE = "mobile-access";
export const MOBILE_REFRESH_AUDIENCE = "mobile-refresh";
export const MOBILE_ISSUER = "gestionale-palestre";

const ACCESS_TTL_SECONDS = 60 * 60; // 1h
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 60; // 60 days

function getSecretBytes(): Uint8Array {
  const raw = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!raw) {
    throw new Error(
      "AUTH_SECRET (o NEXTAUTH_SECRET) non configurato — necessario per firmare i JWT mobile."
    );
  }
  return new TextEncoder().encode(raw);
}

export type MobileAccessPayload = {
  sub: string;
  email: string;
  role: UserRole;
};

export type MobileRefreshPayload = {
  sub: string;
};

export async function signMobileAccessToken(payload: MobileAccessPayload): Promise<string> {
  return await new SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuer(MOBILE_ISSUER)
    .setAudience(MOBILE_ACCESS_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(getSecretBytes());
}

export async function signMobileRefreshToken(payload: MobileRefreshPayload): Promise<string> {
  return await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuer(MOBILE_ISSUER)
    .setAudience(MOBILE_REFRESH_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TTL_SECONDS}s`)
    .sign(getSecretBytes());
}

type VerifiedAccess = MobileAccessPayload & { exp: number };
type VerifiedRefresh = MobileRefreshPayload & { exp: number };

export async function verifyMobileAccessToken(token: string): Promise<VerifiedAccess> {
  const { payload } = await jwtVerify(token, getSecretBytes(), {
    issuer: MOBILE_ISSUER,
    audience: MOBILE_ACCESS_AUDIENCE
  });

  if (typeof payload.sub !== "string" || typeof payload.email !== "string" || typeof payload.role !== "string") {
    throw new Error("Token mobile access senza campi obbligatori");
  }
  if (typeof payload.exp !== "number") {
    throw new Error("Token mobile access senza exp");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    role: payload.role as UserRole,
    exp: payload.exp
  };
}

export async function verifyMobileRefreshToken(token: string): Promise<VerifiedRefresh> {
  const { payload } = await jwtVerify(token, getSecretBytes(), {
    issuer: MOBILE_ISSUER,
    audience: MOBILE_REFRESH_AUDIENCE
  });

  if (typeof payload.sub !== "string") {
    throw new Error("Token mobile refresh senza sub");
  }
  if (typeof payload.exp !== "number") {
    throw new Error("Token mobile refresh senza exp");
  }

  return { sub: payload.sub, exp: payload.exp };
}

export const MOBILE_TOKEN_TTL = {
  accessSeconds: ACCESS_TTL_SECONDS,
  refreshSeconds: REFRESH_TTL_SECONDS
};
