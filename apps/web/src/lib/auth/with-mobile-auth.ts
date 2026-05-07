import { db, type UserRole } from "@gestionale/db";
import { NextResponse, type NextRequest } from "next/server";

import { verifyMobileAccessToken } from "@/lib/auth/mobile-token";

export type MobileAuthedUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
};

export type MobileRouteHandler<R extends object = Record<string, unknown>> = (
  request: NextRequest,
  ctx: { params: R; user: MobileAuthedUser }
) => Promise<Response>;

/**
 * HOF che gateifica un'API route mobile dietro JWT bearer.
 * Errori uniformi (UNAUTHORIZED) per non rivelare dettagli al client.
 */
export function withMobileAuth<R extends object = Record<string, unknown>>(
  handler: MobileRouteHandler<R>,
  options?: { allowedRoles?: UserRole[] }
) {
  return async (
    request: NextRequest,
    ctx?: { params?: Promise<R> | R }
  ) => {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;

    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    let payload;
    try {
      payload = await verifyMobileAccessToken(token);
    } catch {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, firstName: true, lastName: true, role: true }
    });

    if (!user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    if (options?.allowedRoles && !options.allowedRoles.includes(user.role)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    // Route senza segmenti dinamici (es. /api/mobile/me) → Next passa ctx
    // senza `params`. Per route con segmenti, Next 15+ ha `params` come
    // Promise da awaitare.
    const rawParams = ctx?.params;
    const params =
      rawParams && typeof rawParams === "object" && "then" in rawParams
        ? await (rawParams as Promise<R>)
        : ((rawParams ?? {}) as R);

    return await handler(request, { params, user });
  };
}
