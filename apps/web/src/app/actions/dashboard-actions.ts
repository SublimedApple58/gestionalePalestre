"use server";

import { AuditAction, db, UserRole } from "@gestionale/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { buildWorkoutPlanFromFormData } from "@/lib/workout-plan";
import { requireRole, requireSessionUser } from "@/lib/session";
import {
  recordDoorOpen,
  recordEntrySimulation,
  ensureSubscriberCanEnter
} from "@/lib/services/access-event-service";
import { logAdminAction } from "@/lib/services/audit-log-service";
import {
  approveDocumentByAdmin,
  rejectDocumentByAdmin,
  requestDocumentReuploadByAdmin
} from "@/lib/services/document-service";
import { DomainError } from "@/lib/services/errors";
import { safeSyncPinToKeypad } from "@/lib/services/tuya-pin-service";
import {
  assignInstructorByAdmin,
  assignSubscriptionByAdmin,
  createUserByAdmin,
  deleteUserByAdmin,
  updatePersonalInfo,
  updateUserRoleByAdmin
} from "@/lib/services/user-service";
import { saveWorkoutPlan } from "@/lib/services/workout-service";
import { computeSubscriptionEndDate } from "@/lib/subscription";
import {
  adminCreateUserSchema,
  adminDeleteUserSchema,
  adminRoleChangeSchema,
  approveDocumentSchema,
  assignInstructorSchema,
  assignSubscriptionSchema,
  rejectDocumentSchema,
  requestReuploadDocumentSchema,
  updatePersonalInfoSchema
} from "@/lib/validators/forms";

function parseDateInput(value: string | null): Date {
  if (!value) {
    return new Date();
  }

  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return new Date();
  }

  return date;
}

function redirectWithDomainError(error: unknown): never {
  if (error instanceof DomainError) {
    redirect(`/dashboard?error=${error.code.toLowerCase()}`);
  }

  throw error;
}

function redirectWithUtentiError(error: unknown): never {
  if (error instanceof DomainError) {
    redirect(`/utenti?error=${error.code.toLowerCase()}`);
  }

  throw error;
}

export async function createUserByAdminAction(formData: FormData): Promise<void> {
  const user = await requireRole([UserRole.ADMIN]);

  const parsed = adminCreateUserSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role")
  });

  if (!parsed.success) {
    redirect("/utenti?error=utente-non-valido");
  }

  let createdId: string | null = null;
  try {
    const created = await createUserByAdmin(db, user.role, parsed.data);
    createdId = created.id;
  } catch (error) {
    redirectWithUtentiError(error);
  }

  if (createdId) {
    await logAdminAction(db, {
      actorId: user.id,
      targetUserId: createdId,
      action: AuditAction.USER_CREATED,
      payload: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email,
        role: parsed.data.role
      }
    });
  }

  revalidatePath("/utenti");
  redirect("/utenti");
}

export async function changeUserRoleAction(formData: FormData): Promise<void> {
  const user = await requireRole([UserRole.ADMIN]);

  const parsed = adminRoleChangeSchema.safeParse({
    targetUserId: formData.get("targetUserId"),
    role: formData.get("role")
  });

  if (!parsed.success) {
    redirect("/utenti?error=ruolo-non-valido");
  }

  const before = await db.user
    .findUnique({ where: { id: parsed.data.targetUserId }, select: { role: true } })
    .catch(() => null);

  try {
    await updateUserRoleByAdmin(db, user.role, parsed.data);
  } catch (error) {
    redirectWithUtentiError(error);
  }

  await logAdminAction(db, {
    actorId: user.id,
    targetUserId: parsed.data.targetUserId,
    action: AuditAction.ROLE_CHANGED,
    payload: { before: { role: before?.role ?? null }, after: { role: parsed.data.role } }
  });

  revalidatePath("/utenti");
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  const user = await requireRole([UserRole.ADMIN]);

  const parsed = adminDeleteUserSchema.safeParse({
    targetUserId: formData.get("targetUserId")
  });

  if (!parsed.success) {
    redirect("/utenti?error=utente-non-trovato");
  }

  // Log PRIMA della delete per popolare targetSnapshot mentre l'utente esiste.
  await logAdminAction(db, {
    actorId: user.id,
    targetUserId: parsed.data.targetUserId,
    action: AuditAction.USER_DELETED
  });

  try {
    await deleteUserByAdmin(db, user.role, parsed.data);
  } catch (error) {
    redirectWithUtentiError(error);
  }

  revalidatePath("/utenti");
}

export async function assignSubscriptionAction(formData: FormData): Promise<void> {
  const user = await requireRole([UserRole.ADMIN]);

  const parsed = assignSubscriptionSchema.safeParse({
    targetUserId: formData.get("targetUserId"),
    tier: formData.get("tier"),
    startsAt: parseDateInput(formData.get("startsAt")?.toString() ?? null)
  });

  if (!parsed.success) {
    redirect("/utenti?error=abbonamento-non-valido");
  }

  try {
    await assignSubscriptionByAdmin(db, user.role, user.id, parsed.data);
  } catch (error) {
    redirectWithUtentiError(error);
  }

  await logAdminAction(db, {
    actorId: user.id,
    targetUserId: parsed.data.targetUserId,
    action: AuditAction.SUBSCRIPTION_ASSIGNED,
    payload: { tier: parsed.data.tier, startsAt: parsed.data.startsAt.toISOString() }
  });

  revalidatePath("/utenti");
}

export async function assignInstructorAction(formData: FormData): Promise<void> {
  const user = await requireRole([UserRole.ADMIN]);

  const parsed = assignInstructorSchema.safeParse({
    subscriberId: formData.get("subscriberId"),
    instructorId: formData.get("instructorId")
  });

  if (!parsed.success) {
    redirect("/utenti?error=assegnazione-non-valida");
  }

  const before = await db.user
    .findUnique({ where: { id: parsed.data.subscriberId }, select: { assignedInstructorId: true } })
    .catch(() => null);

  try {
    await assignInstructorByAdmin(db, user.role, parsed.data);
  } catch (error) {
    redirectWithUtentiError(error);
  }

  await logAdminAction(db, {
    actorId: user.id,
    targetUserId: parsed.data.subscriberId,
    action: AuditAction.INSTRUCTOR_ASSIGNED,
    payload: {
      before: { instructorId: before?.assignedInstructorId ?? null },
      after: { instructorId: parsed.data.instructorId }
    }
  });

  revalidatePath("/utenti");
}

export async function saveWorkoutPlanAction(formData: FormData): Promise<void> {
  const user = await requireSessionUser();

  await saveWorkoutPlan(db, user.id, buildWorkoutPlanFromFormData(formData));
  revalidatePath("/dashboard");
}

export async function simulateEntryAction(): Promise<void> {
  const user = await requireSessionUser();

  if (user.role === UserRole.SUBSCRIBER) {
    try {
      await ensureSubscriberCanEnter(db, user.id);
    } catch (error) {
      redirectWithDomainError(error);
    }
  }

  await recordEntrySimulation(db, user.id);
  revalidatePath("/dashboard");
}

export async function openGymDoorAction(): Promise<void> {
  const user = await requireRole([UserRole.ADMIN]);

  await recordDoorOpen(db, user.id);
  revalidatePath("/dashboard");
}

export async function updatePersonalInfoAction(formData: FormData): Promise<void> {
  const user = await requireSessionUser();

  const parsed = updatePersonalInfoSchema.safeParse({
    phoneNumber: formData.get("phoneNumber"),
    address: formData.get("address") ?? undefined
  });

  if (!parsed.success) {
    redirect("/profilo?error=profilo-non-valido");
  }

  await updatePersonalInfo(db, {
    userId: user.id,
    phoneNumber: parsed.data.phoneNumber,
    address: parsed.data.address
  });

  revalidatePath("/profilo");
  revalidatePath("/dashboard");
}

export async function approveDocumentAction(formData: FormData): Promise<void> {
  const user = await requireRole([UserRole.ADMIN]);

  const parsed = approveDocumentSchema.safeParse({
    documentId: formData.get("documentId"),
    medicalCertificateExpiresAt: formData.get("medicalCertificateExpiresAt")
  });

  if (!parsed.success) {
    redirect("/dashboard?error=documento-non-valido");
  }

  const doc = await db.userDocument
    .findUnique({ where: { id: parsed.data.documentId }, select: { userId: true, type: true, side: true } })
    .catch(() => null);

  try {
    await approveDocumentByAdmin(db, user.role, user.id, parsed.data);
  } catch (error) {
    redirectWithDomainError(error);
  }

  if (doc) {
    await logAdminAction(db, {
      actorId: user.id,
      targetUserId: doc.userId,
      action: AuditAction.DOC_APPROVED,
      payload: { documentId: parsed.data.documentId, type: doc.type, side: doc.side }
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/profilo");
}

export async function rejectDocumentAction(formData: FormData): Promise<void> {
  const user = await requireRole([UserRole.ADMIN]);

  const parsed = rejectDocumentSchema.safeParse({
    documentId: formData.get("documentId"),
    rejectionReason: formData.get("rejectionReason")
  });

  if (!parsed.success) {
    redirect("/dashboard?error=documento-non-valido");
  }

  const docReject = await db.userDocument
    .findUnique({ where: { id: parsed.data.documentId }, select: { userId: true, type: true, side: true } })
    .catch(() => null);

  try {
    await rejectDocumentByAdmin(db, user.role, user.id, parsed.data);
  } catch (error) {
    redirectWithDomainError(error);
  }

  if (docReject) {
    await logAdminAction(db, {
      actorId: user.id,
      targetUserId: docReject.userId,
      action: AuditAction.DOC_REJECTED,
      payload: {
        documentId: parsed.data.documentId,
        type: docReject.type,
        side: docReject.side,
        reason: parsed.data.rejectionReason
      }
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/profilo");
}

export async function updateUserAddressAction(formData: FormData): Promise<void> {
  const actor = await requireRole([UserRole.ADMIN]);

  const targetUserId = formData.get("targetUserId");
  const address = formData.get("address");

  if (typeof targetUserId !== "string" || !targetUserId) {
    redirect("/utenti?error=utente-non-valido");
  }

  const beforeAddress = await db.user
    .findUnique({ where: { id: targetUserId }, select: { address: true } })
    .catch(() => null);

  const nextAddress = typeof address === "string" ? address.trim() || null : null;

  await db.user.update({
    where: { id: targetUserId },
    data: { address: nextAddress }
  });

  await logAdminAction(db, {
    actorId: actor.id,
    targetUserId,
    action: AuditAction.ADDRESS_UPDATED,
    payload: { before: { address: beforeAddress?.address ?? null }, after: { address: nextAddress } }
  });

  revalidatePath("/utenti");
}

export async function requestReuploadAction(formData: FormData): Promise<void> {
  const user = await requireRole([UserRole.ADMIN]);

  const parsed = requestReuploadDocumentSchema.safeParse({
    documentId: formData.get("documentId"),
    reason: formData.get("reason")
  });

  if (!parsed.success) {
    redirect("/dashboard?error=documento-non-valido");
  }

  const docReupload = await db.userDocument
    .findUnique({ where: { id: parsed.data.documentId }, select: { userId: true, type: true, side: true } })
    .catch(() => null);

  try {
    await requestDocumentReuploadByAdmin(db, user.role, user.id, parsed.data);
  } catch (error) {
    redirectWithDomainError(error);
  }

  if (docReupload) {
    await logAdminAction(db, {
      actorId: user.id,
      targetUserId: docReupload.userId,
      action: AuditAction.DOC_REUPLOAD_REQUESTED,
      payload: {
        documentId: parsed.data.documentId,
        type: docReupload.type,
        side: docReupload.side,
        reason: parsed.data.reason ?? null
      }
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/profilo");
}

// ── State-returning variants per useActionState (drawer toast) ──────────────

export type ActionResult = { ok: boolean; message: string } | null;

export async function changeUserRoleActionState(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const user = await requireRole([UserRole.ADMIN]);
    const parsed = adminRoleChangeSchema.safeParse({
      targetUserId: formData.get("targetUserId"),
      role: formData.get("role")
    });
    if (!parsed.success) return { ok: false, message: "Dati del ruolo non validi." };

    const before = await db.user
      .findUnique({ where: { id: parsed.data.targetUserId }, select: { role: true } })
      .catch(() => null);

    await updateUserRoleByAdmin(db, user.role, parsed.data);

    await logAdminAction(db, {
      actorId: user.id,
      targetUserId: parsed.data.targetUserId,
      action: AuditAction.ROLE_CHANGED,
      payload: { before: { role: before?.role ?? null }, after: { role: parsed.data.role } }
    });

    revalidatePath("/utenti");
    return { ok: true, message: "Ruolo aggiornato." };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, message: e.message };
    return { ok: false, message: "Errore imprevisto." };
  }
}

export async function assignInstructorActionState(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const user = await requireRole([UserRole.ADMIN]);
    const parsed = assignInstructorSchema.safeParse({
      subscriberId: formData.get("subscriberId"),
      instructorId: formData.get("instructorId")
    });
    if (!parsed.success) return { ok: false, message: "Dati istruttore non validi." };

    const before = await db.user
      .findUnique({ where: { id: parsed.data.subscriberId }, select: { assignedInstructorId: true } })
      .catch(() => null);

    await assignInstructorByAdmin(db, user.role, parsed.data);

    await logAdminAction(db, {
      actorId: user.id,
      targetUserId: parsed.data.subscriberId,
      action: AuditAction.INSTRUCTOR_ASSIGNED,
      payload: {
        before: { instructorId: before?.assignedInstructorId ?? null },
        after: { instructorId: parsed.data.instructorId }
      }
    });

    revalidatePath("/utenti");
    return { ok: true, message: "Istruttore assegnato." };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, message: e.message };
    return { ok: false, message: "Errore imprevisto." };
  }
}

export async function assignSubscriptionActionState(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const user = await requireRole([UserRole.ADMIN]);
    const parsed = assignSubscriptionSchema.safeParse({
      targetUserId: formData.get("targetUserId"),
      tier: formData.get("tier"),
      startsAt: parseDateInput(formData.get("startsAt")?.toString() ?? null)
    });
    if (!parsed.success) return { ok: false, message: "Dati abbonamento non validi." };
    await assignSubscriptionByAdmin(db, user.role, user.id, parsed.data);
    await logAdminAction(db, {
      actorId: user.id,
      targetUserId: parsed.data.targetUserId,
      action: AuditAction.SUBSCRIPTION_ASSIGNED,
      payload: { tier: parsed.data.tier, startsAt: parsed.data.startsAt.toISOString() }
    });
    revalidatePath("/utenti");
    return { ok: true, message: "Abbonamento aggiornato." };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, message: e.message };
    return { ok: false, message: "Errore imprevisto." };
  }
}

export async function updateUserAddressActionState(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const actor = await requireRole([UserRole.ADMIN]);
    const targetUserId = formData.get("targetUserId");
    const address = formData.get("address");
    if (typeof targetUserId !== "string" || !targetUserId) {
      return { ok: false, message: "Utente non trovato." };
    }
    const beforeAddress = await db.user
      .findUnique({ where: { id: targetUserId }, select: { address: true } })
      .catch(() => null);
    const nextAddress = typeof address === "string" ? address.trim() || null : null;
    await db.user.update({
      where: { id: targetUserId },
      data: { address: nextAddress }
    });
    await logAdminAction(db, {
      actorId: actor.id,
      targetUserId,
      action: AuditAction.ADDRESS_UPDATED,
      payload: { before: { address: beforeAddress?.address ?? null }, after: { address: nextAddress } }
    });
    revalidatePath("/utenti");
    return { ok: true, message: "Indirizzo salvato." };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, message: e.message };
    return { ok: false, message: "Errore imprevisto." };
  }
}

export async function deleteUserActionState(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const user = await requireRole([UserRole.ADMIN]);
    const parsed = adminDeleteUserSchema.safeParse({
      targetUserId: formData.get("targetUserId")
    });
    if (!parsed.success) return { ok: false, message: "Utente non trovato." };
    // Log PRIMA della delete per popolare targetSnapshot mentre l'utente esiste.
    await logAdminAction(db, {
      actorId: user.id,
      targetUserId: parsed.data.targetUserId,
      action: AuditAction.USER_DELETED
    });
    await deleteUserByAdmin(db, user.role, parsed.data);
    revalidatePath("/utenti");
    return { ok: true, message: "Utente eliminato." };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, message: e.message };
    return { ok: false, message: "Errore imprevisto." };
  }
}

// ── Subscription lifecycle (admin) ─────────────────────────────────────────

export async function deactivateSubscriptionActionState(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const user = await requireRole([UserRole.ADMIN]);
    const targetUserId = formData.get("targetUserId");
    if (typeof targetUserId !== "string" || !targetUserId) {
      return { ok: false, message: "Utente non valido." };
    }

    const sub = await db.userSubscription.findUnique({
      where: { userId: targetUserId },
      select: { tier: true, deactivatedAt: true }
    });
    if (!sub) return { ok: false, message: "Nessun abbonamento da disattivare." };
    if (sub.deactivatedAt) {
      return { ok: true, message: "Abbonamento gia' disattivato." };
    }

    const now = new Date();
    await db.userSubscription.update({
      where: { userId: targetUserId },
      data: { deactivatedAt: now }
    });

    safeSyncPinToKeypad(db, targetUserId);

    await logAdminAction(db, {
      actorId: user.id,
      targetUserId,
      action: AuditAction.SUBSCRIPTION_DEACTIVATED,
      payload: { tier: sub.tier, deactivatedAt: now.toISOString() }
    });

    revalidatePath("/utenti");
    return { ok: true, message: "Abbonamento disattivato." };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, message: e.message };
    return { ok: false, message: "Errore imprevisto." };
  }
}

export async function reactivateSubscriptionActionState(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const user = await requireRole([UserRole.ADMIN]);
    const targetUserId = formData.get("targetUserId");
    if (typeof targetUserId !== "string" || !targetUserId) {
      return { ok: false, message: "Utente non valido." };
    }

    const sub = await db.userSubscription.findUnique({
      where: { userId: targetUserId },
      select: { tier: true, deactivatedAt: true }
    });
    if (!sub) return { ok: false, message: "Nessun abbonamento da riattivare." };
    if (!sub.deactivatedAt) {
      return { ok: true, message: "Abbonamento gia' attivo." };
    }

    await db.userSubscription.update({
      where: { userId: targetUserId },
      data: { deactivatedAt: null }
    });

    safeSyncPinToKeypad(db, targetUserId);

    await logAdminAction(db, {
      actorId: user.id,
      targetUserId,
      action: AuditAction.SUBSCRIPTION_REACTIVATED,
      payload: { tier: sub.tier, previousDeactivatedAt: sub.deactivatedAt.toISOString() }
    });

    revalidatePath("/utenti");
    return { ok: true, message: "Abbonamento riattivato." };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, message: e.message };
    return { ok: false, message: "Errore imprevisto." };
  }
}

export async function changeSubscriptionStartDateActionState(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const user = await requireRole([UserRole.ADMIN]);
    const targetUserId = formData.get("targetUserId");
    const rawStartsAt = formData.get("startsAt")?.toString();
    if (typeof targetUserId !== "string" || !targetUserId || !rawStartsAt) {
      return { ok: false, message: "Dati non validi." };
    }
    const newStartsAt = new Date(rawStartsAt);
    if (Number.isNaN(newStartsAt.getTime())) {
      return { ok: false, message: "Data non valida." };
    }

    const sub = await db.userSubscription.findUnique({
      where: { userId: targetUserId },
      select: { tier: true, startsAt: true, endsAt: true }
    });
    if (!sub) return { ok: false, message: "Nessun abbonamento per questo utente." };

    const newEndsAt = computeSubscriptionEndDate(sub.tier, newStartsAt);

    await db.userSubscription.update({
      where: { userId: targetUserId },
      data: { startsAt: newStartsAt, endsAt: newEndsAt }
    });

    safeSyncPinToKeypad(db, targetUserId);

    await logAdminAction(db, {
      actorId: user.id,
      targetUserId,
      action: AuditAction.SUBSCRIPTION_DATE_CHANGED,
      payload: {
        before: { startsAt: sub.startsAt.toISOString(), endsAt: sub.endsAt.toISOString() },
        after: { startsAt: newStartsAt.toISOString(), endsAt: newEndsAt.toISOString() }
      }
    });

    revalidatePath("/utenti");
    return { ok: true, message: "Data di partenza aggiornata." };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, message: e.message };
    return { ok: false, message: "Errore imprevisto." };
  }
}
