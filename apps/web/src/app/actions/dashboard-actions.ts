"use server";

import { db, UserRole } from "@gestionale/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { buildWorkoutPlanFromFormData } from "@/lib/workout-plan";
import { requireRole, requireSessionUser } from "@/lib/session";
import {
  recordDoorOpen,
  recordEntrySimulation,
  ensureSubscriberCanEnter
} from "@/lib/services/access-event-service";
import {
  approveDocumentByAdmin,
  rejectDocumentByAdmin,
  requestDocumentReuploadByAdmin
} from "@/lib/services/document-service";
import { DomainError } from "@/lib/services/errors";
import {
  assignInstructorByAdmin,
  assignSubscriptionByAdmin,
  createUserByAdmin,
  deleteUserByAdmin,
  updatePersonalInfo,
  updateUserRoleByAdmin
} from "@/lib/services/user-service";
import { saveWorkoutPlan } from "@/lib/services/workout-service";
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
    redirect("/dashboard?error=utente-non-valido");
  }

  try {
    await createUserByAdmin(db, user.role, parsed.data);
  } catch (error) {
    redirectWithDomainError(error);
  }

  revalidatePath("/dashboard");
}

export async function changeUserRoleAction(formData: FormData): Promise<void> {
  const user = await requireRole([UserRole.ADMIN]);

  const parsed = adminRoleChangeSchema.safeParse({
    targetUserId: formData.get("targetUserId"),
    role: formData.get("role")
  });

  if (!parsed.success) {
    redirect("/dashboard?error=ruolo-non-valido");
  }

  try {
    await updateUserRoleByAdmin(db, user.role, parsed.data);
  } catch (error) {
    redirectWithDomainError(error);
  }

  revalidatePath("/dashboard");
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  const user = await requireRole([UserRole.ADMIN]);

  const parsed = adminDeleteUserSchema.safeParse({
    targetUserId: formData.get("targetUserId")
  });

  if (!parsed.success) {
    redirect("/dashboard?error=utente-non-trovato");
  }

  try {
    await deleteUserByAdmin(db, user.role, parsed.data);
  } catch (error) {
    redirectWithDomainError(error);
  }

  revalidatePath("/dashboard");
}

export async function assignSubscriptionAction(formData: FormData): Promise<void> {
  const user = await requireRole([UserRole.ADMIN]);

  const parsed = assignSubscriptionSchema.safeParse({
    targetUserId: formData.get("targetUserId"),
    tier: formData.get("tier"),
    startsAt: parseDateInput(formData.get("startsAt")?.toString() ?? null)
  });

  if (!parsed.success) {
    redirect("/dashboard?error=abbonamento-non-valido");
  }

  try {
    await assignSubscriptionByAdmin(db, user.role, user.id, parsed.data);
  } catch (error) {
    redirectWithDomainError(error);
  }

  revalidatePath("/dashboard");
}

export async function assignInstructorAction(formData: FormData): Promise<void> {
  const user = await requireRole([UserRole.ADMIN]);

  const parsed = assignInstructorSchema.safeParse({
    subscriberId: formData.get("subscriberId"),
    instructorId: formData.get("instructorId")
  });

  if (!parsed.success) {
    redirect("/dashboard?error=assegnazione-non-valida");
  }

  try {
    await assignInstructorByAdmin(db, user.role, parsed.data);
  } catch (error) {
    redirectWithDomainError(error);
  }

  revalidatePath("/dashboard");
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
    phoneNumber: formData.get("phoneNumber")
  });

  if (!parsed.success) {
    redirect("/dashboard?error=profilo-non-valido");
  }

  await updatePersonalInfo(db, {
    userId: user.id,
    phoneNumber: parsed.data.phoneNumber
  });

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

  try {
    await approveDocumentByAdmin(db, user.role, user.id, parsed.data);
  } catch (error) {
    redirectWithDomainError(error);
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

  try {
    await rejectDocumentByAdmin(db, user.role, user.id, parsed.data);
  } catch (error) {
    redirectWithDomainError(error);
  }

  revalidatePath("/dashboard");
  revalidatePath("/profilo");
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

  try {
    await requestDocumentReuploadByAdmin(db, user.role, user.id, parsed.data);
  } catch (error) {
    redirectWithDomainError(error);
  }

  revalidatePath("/dashboard");
  revalidatePath("/profilo");
}
