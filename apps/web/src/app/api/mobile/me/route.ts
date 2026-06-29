import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { getProfilePhotoUrl } from "@/lib/profile-photo";
import { isSubscriptionActive } from "@/lib/subscription";
import { logAdminAction } from "@/lib/services/audit-log-service";
import { removeTuyaUserCompletely } from "@/lib/services/tuya-pin-service";

import { mobileUpdateProfileSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/me
 * Auth: bearer access token
 * 200: { user, accessCode, subscription | null, avatarUrl | null }
 *
 * Single source of truth per la home dell'app. Mantiene minimale il payload.
 */
export const GET = withMobileAuth(async (_request, { user }) => {
  const [profile, subscription, avatarUrl] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: {
        accessCode: true,
        phoneNumber: true,
        address: true,
        dateOfBirth: true,
        sddMandateAcceptedAt: true
      }
    }),
    db.userSubscription.findUnique({
      where: { userId: user.id },
      select: { tier: true, startsAt: true, endsAt: true, deactivatedAt: true }
    }),
    getProfilePhotoUrl(user.id).catch(() => null)
  ]);

  if (!profile) {
    return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
  }

  const now = new Date();
  const isActive = isSubscriptionActive(subscription, now);
  const daysRemaining =
    subscription && isActive
      ? Math.max(
          0,
          Math.ceil((subscription.endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        )
      : 0;

  // Gate bloccante mobile: mostrato a TUTTI gli utenti che non hanno ancora preso
  // visione del mandato SEPA SDD (qualsiasi ruolo, qualsiasi abbonamento).
  const requiresSddAcknowledgement = !profile.sddMandateAcceptedAt;

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      phoneNumber: profile.phoneNumber,
      address: profile.address,
      dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.toISOString() : null
    },
    accessCode: profile.accessCode,
    avatarUrl,
    requiresSddAcknowledgement,
    subscription: subscription
      ? {
          tier: subscription.tier,
          startsAt: subscription.startsAt.toISOString(),
          endsAt: subscription.endsAt.toISOString(),
          isActive,
          daysRemaining
        }
      : null
  });
});

/**
 * PATCH /api/mobile/me
 * Auth: bearer access token
 * Body: { firstName?, lastName?, phoneNumber?, address?, dateOfBirth? (ISO|null) }
 * 200: payload identico a GET dopo update.
 *
 * Email NON è editabile dal mobile (è chiave login → richiede flusso verifica).
 */
export const PATCH = withMobileAuth(async (request, { user }) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = mobileUpdateProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_BODY", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const update: Record<string, unknown> = {};

  if (data.firstName !== undefined) update.firstName = data.firstName;
  if (data.lastName !== undefined) update.lastName = data.lastName;
  if (data.phoneNumber !== undefined) update.phoneNumber = data.phoneNumber || null;
  if (data.address !== undefined) update.address = data.address || null;
  if (data.dateOfBirth !== undefined) {
    update.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "NO_FIELDS_TO_UPDATE" }, { status: 400 });
  }

  await db.user.update({
    where: { id: user.id },
    data: update
  });

  // Reload + same payload shape della GET per semplificare il client.
  const [profile, subscription, avatarUrl] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        accessCode: true,
        phoneNumber: true,
        address: true,
        dateOfBirth: true,
        sddMandateAcceptedAt: true
      }
    }),
    db.userSubscription.findUnique({
      where: { userId: user.id },
      select: { tier: true, startsAt: true, endsAt: true, deactivatedAt: true }
    }),
    getProfilePhotoUrl(user.id).catch(() => null)
  ]);

  if (!profile) {
    return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
  }

  const now = new Date();
  const isActive = isSubscriptionActive(subscription, now);
  const daysRemaining =
    subscription && isActive
      ? Math.max(
          0,
          Math.ceil((subscription.endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        )
      : 0;

  const requiresSddAcknowledgement = !profile.sddMandateAcceptedAt;

  return NextResponse.json({
    user: {
      id: user.id,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      role: profile.role,
      phoneNumber: profile.phoneNumber,
      address: profile.address,
      dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.toISOString() : null
    },
    accessCode: profile.accessCode,
    avatarUrl,
    requiresSddAcknowledgement,
    subscription: subscription
      ? {
          tier: subscription.tier,
          startsAt: subscription.startsAt.toISOString(),
          endsAt: subscription.endsAt.toISOString(),
          isActive,
          daysRemaining
        }
      : null
  });
});

/**
 * DELETE /api/mobile/me
 * Auth: bearer access token
 * Elimina definitivamente l'account dell'utente autenticato (App Store 5.1.1v).
 * 204: eliminato. 400 LAST_ADMIN: non si può eliminare l'ultimo admin.
 *
 * Self-service: l'utente cancella se stesso. Pulisce il PIN/utente Tuya e
 * registra l'azione nell'audit log (actor = target = se stesso).
 */
export const DELETE = withMobileAuth(async (_request, { user }) => {
  // Guardia: non lasciare la piattaforma senza admin.
  if (user.role === UserRole.ADMIN) {
    const adminsCount = await db.user.count({ where: { role: UserRole.ADMIN } });
    if (adminsCount <= 1) {
      return NextResponse.json({ error: "LAST_ADMIN" }, { status: 400 });
    }
  }

  // Audit prima della delete (lo snapshot del target sopravvive alla cancellazione).
  await logAdminAction(db, {
    actorId: user.id,
    targetUserId: user.id,
    action: "USER_DELETED",
    payload: { source: "mobile-self-delete" }
  });

  // Rimozione completa lato Tuya (best-effort: non blocca la cancellazione).
  try {
    await removeTuyaUserCompletely(db, user.id);
  } catch (e) {
    console.error(`[mobile/me DELETE] Tuya cleanup failed for ${user.id}:`, e);
  }

  await db.user.delete({ where: { id: user.id } });

  return new NextResponse(null, { status: 204 });
});
