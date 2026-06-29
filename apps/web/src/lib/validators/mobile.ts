import { DocumentSide, DocumentType, SubscriptionTier, UserRole, WorkoutSetType } from "@gestionale/db";
import { z } from "zod";

import { CHECKOUT_TIERS } from "@/lib/subscription";

/** Body POST /api/mobile/auth/login */
export const mobileLoginSchema = z.object({
  email: z.string().trim().email("Email non valida"),
  password: z.string().min(8, "Password minimo 8 caratteri").max(128)
});

/** Body POST /api/mobile/auth/register */
export const mobileRegisterSchema = z.object({
  firstName: z.string().trim().min(2, "Nome troppo corto").max(60),
  lastName: z.string().trim().min(2, "Cognome troppo corto").max(60),
  email: z.string().trim().email("Email non valida"),
  password: z.string().min(8, "Password minimo 8 caratteri").max(128),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^[+]?[0-9 .\-/()]{6,40}$/, "Numero di telefono non valido"),
  address: z.string().trim().min(5, "Indirizzo troppo corto").max(200).optional(),
  acceptedTerms: z.literal(true)
});

/** Body POST /api/mobile/auth/refresh */
export const mobileRefreshSchema = z.object({
  refreshToken: z.string().min(20)
});

/** Body POST /api/mobile/auth/forgot-password */
export const mobileForgotPasswordSchema = z.object({
  email: z.string().trim().email("Email non valida")
});

/** Body POST /api/mobile/auth/reset-password */
export const mobileResetPasswordSchema = z.object({
  email: z.string().trim().email("Email non valida"),
  code: z.string().trim().regex(/^\d{6}$/, "Codice non valido"),
  newPassword: z.string().min(8, "Password minimo 8 caratteri").max(128)
});

/** Body POST /api/mobile/payments/initiate */
export const mobileInitiatePaymentSchema = z.object({
  tier: z.nativeEnum(SubscriptionTier).refine(
    (value) => (CHECKOUT_TIERS as readonly string[]).includes(value),
    "Tier non valido per il checkout"
  )
});

/** Body POST /api/mobile/payments/confirm */
export const mobileConfirmPaymentSchema = z.object({
  paymentId: z.string().min(1)
});

/** Body PATCH /api/mobile/me */
export const mobileUpdateProfileSchema = z
  .object({
    firstName: z.string().trim().min(1, "Nome obbligatorio").max(80).optional(),
    lastName: z.string().trim().min(1, "Cognome obbligatorio").max(80).optional(),
    phoneNumber: z
      .string()
      .trim()
      .max(40)
      .regex(/^[+]?[0-9 .\-/()]{6,40}$/, "Numero di telefono non valido")
      .or(z.literal(""))
      .optional(),
    address: z.string().trim().max(240).or(z.literal("")).optional(),
    dateOfBirth: z
      .string()
      .datetime({ offset: true })
      .or(z.literal(""))
      .nullable()
      .optional()
  })
  .strict();

/** Body POST /api/mobile/me/avatar/upload-url */
export const mobileAvatarUploadUrlSchema = z.object({
  fileName: z.string().min(1).max(120),
  mimeType: z.enum(["image/jpeg", "image/jpg", "image/png", "image/webp"]),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(8 * 1024 * 1024) // 8 MB
});

/** Body POST /api/mobile/me/avatar/confirm */
export const mobileAvatarConfirmSchema = z.object({
  storageKey: z.string().min(1).max(400),
  fileName: z.string().min(1).max(120),
  mimeType: z.enum(["image/jpeg", "image/jpg", "image/png", "image/webp"]),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(8 * 1024 * 1024)
});

/* ── DOCUMENTI ISCRITTO (onboarding mobile) ──────────────────────────── */

const documentMimeType = z.enum(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const documentFileSize = z
  .number()
  .int()
  .positive()
  .max(12 * 1024 * 1024); // 12 MB (allineato a DOC_UPLOAD_MAX_BYTES default)

/** Body POST /api/mobile/me/documents/presign */
export const mobileDocumentPresignSchema = z.object({
  type: z.nativeEnum(DocumentType),
  side: z.nativeEnum(DocumentSide),
  fileName: z.string().trim().min(1).max(120),
  mimeType: documentMimeType,
  fileSize: documentFileSize
});

/** Body POST /api/mobile/me/documents/commit */
export const mobileDocumentCommitSchema = z.object({
  type: z.nativeEnum(DocumentType),
  side: z.nativeEnum(DocumentSide),
  storageKey: z.string().trim().min(1).max(400),
  fileName: z.string().trim().min(1).max(120),
  mimeType: documentMimeType,
  fileSize: documentFileSize,
  // Forward-compat: scadenza certificato medico. In v1 la UI mobile non la invia
  // (l'admin la imposta in fase di approvazione).
  medicalCertificateExpiresAt: z.string().datetime({ offset: true }).optional()
});

/* ── FOTO ESERCIZIO (catalogo, admin/instructor) ─────────────────────── */

const exercisePhotoMimeType = z.enum(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const exercisePhotoFileSize = z
  .number()
  .int()
  .positive()
  .max(8 * 1024 * 1024); // 8 MB (foto dimostrativa, allineato all'avatar)

/** Body POST /api/mobile/workouts/exercises/[id]/photo/upload-url */
export const mobileExercisePhotoUploadUrlSchema = z.object({
  fileName: z.string().trim().min(1).max(120),
  mimeType: exercisePhotoMimeType,
  fileSize: exercisePhotoFileSize
});

/** Body POST /api/mobile/workouts/exercises/[id]/photo/confirm */
export const mobileExercisePhotoConfirmSchema = z.object({
  storageKey: z.string().trim().min(1).max(400),
  fileName: z.string().trim().min(1).max(120),
  mimeType: exercisePhotoMimeType,
  fileSize: exercisePhotoFileSize
});

/* ── ADMIN ────────────────────────────────────────────────────────────── */

/** Query GET /api/mobile/admin/users */
export const mobileAdminUsersQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.nativeEnum(UserRole).optional(),
  /** Ordinamento lista: alfabetico per nome (default) o per data di iscrizione (createdAt). */
  sort: z.enum(["alpha", "registration"]).optional(),
  /** Filtro iscrizione associazione sportiva. */
  association: z.enum(["all", "member", "non_member"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).optional()
});

/** Query GET /api/mobile/admin/access-logs */
export const mobileAdminAccessLogsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).optional()
});

/** Body POST /api/mobile/admin/users — alias di adminCreateUserSchema. */
export const mobileAdminCreateUserSchema = z.object({
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  email: z.string().trim().email("Email non valida"),
  password: z.string().min(8, "Password minimo 8 caratteri").max(128),
  role: z.nativeEnum(UserRole)
});

/** Body POST /api/mobile/admin/users/[id]/role */
export const mobileAdminUserRoleSchema = z.object({
  role: z.nativeEnum(UserRole)
});

/** Body POST /api/mobile/admin/users/[id]/instructor — null per disassegnare. */
export const mobileAdminUserInstructorSchema = z.object({
  instructorId: z.string().min(1).nullable()
});

/** Body POST /api/mobile/admin/users/[id]/subscription */
export const mobileAdminUserSubscriptionSchema = z.object({
  tier: z.nativeEnum(SubscriptionTier),
  startsAt: z.string().datetime({ offset: true }).optional()
});

/** Body POST /api/mobile/admin/users/[id]/address */
export const mobileAdminUserAddressSchema = z.object({
  address: z.string().trim().max(240).or(z.literal("")).nullable().optional()
});

/** Body POST /api/mobile/admin/documents/[id]/reject */
export const mobileAdminDocumentRejectSchema = z.object({
  reason: z.string().trim().min(4).max(400)
});

/** Body POST /api/mobile/admin/documents/[id]/reupload */
export const mobileAdminDocumentReuploadSchema = z.object({
  reason: z.string().trim().min(4).max(400).optional()
});

/* ── INSTRUCTOR ──────────────────────────────────────────────────────── */

/** Body POST /api/mobile/instructor/weekly-plan — 7 giorni opzionali. */
const dayField = z.string().trim().max(2000).nullable().optional();
export const mobileWeeklyPlanSchema = z.object({
  monday: dayField,
  tuesday: dayField,
  wednesday: dayField,
  thursday: dayField,
  friday: dayField,
  saturday: dayField,
  sunday: dayField
});

/* ── WORKOUTS ────────────────────────────────────────────────────────── */

const workoutSetSchema = z.object({
  type: z.nativeEnum(WorkoutSetType),
  reps: z.string().trim().min(1).max(60),
  rir: z.number().int().min(0).max(20).nullable().optional(),
  rest: z.number().int().min(0).max(3600).nullable().optional(),
  notes: z.string().trim().max(400).nullable().optional()
});

const workoutExerciseSchema = z.object({
  exerciseId: z.string().min(1),
  notes: z.string().trim().max(400).nullable().optional(),
  sets: z.array(workoutSetSchema).min(1).max(20)
});

const workoutSessionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  exercises: z.array(workoutExerciseSchema).min(1).max(40)
});

/** Body POST /api/mobile/workouts/templates */
export const mobileCreateWorkoutTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(800).nullable().optional(),
  daysPerWeek: z.number().int().min(1).max(7),
  sessions: z.array(workoutSessionSchema).min(1).max(7)
});

/** Body PATCH /api/mobile/workouts/templates/[id] */
export const mobileUpdateWorkoutTemplateSchema = mobileCreateWorkoutTemplateSchema;

/** Body POST /api/mobile/workouts/templates/[id]/assign|unassign */
export const mobileWorkoutAssignSchema = z.object({
  // Cap alto: "A tutti" invia l'intera anagrafica (admin) — può superare di molto
  // le 200 unità. 5000 copre qualsiasi palestra mantenendo un limite anti-abuso.
  userIds: z.array(z.string().min(1)).min(1).max(5000)
});

/** Body POST /api/mobile/workouts/exercises */
export const mobileCreateExerciseSchema = z.object({
  name: z.string().trim().min(2).max(80),
  muscleGroup: z.string().trim().max(40).nullable().optional(),
  equipment: z.string().trim().max(60).nullable().optional(),
  notes: z.string().trim().max(400).nullable().optional()
});
