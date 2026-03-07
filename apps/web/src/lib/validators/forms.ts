import { DocumentSide, DocumentType, SubscriptionTier, UserRole } from "@gestionale/db";
import { z } from "zod";

const email = z.string().trim().email("Email non valida");
const password = z
  .string()
  .min(8, "La password deve avere almeno 8 caratteri")
  .max(128, "La password e' troppo lunga");
const optionalDate = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : value),
  z.coerce.date().optional()
);

export const registerSchema = z.object({
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  email,
  password
});

export const loginSchema = z.object({
  email,
  password
});

export const adminCreateUserSchema = registerSchema.extend({
  role: z.nativeEnum(UserRole)
});

export const adminRoleChangeSchema = z.object({
  targetUserId: z.string().min(1),
  role: z.nativeEnum(UserRole)
});

export const adminDeleteUserSchema = z.object({
  targetUserId: z.string().min(1)
});

export const assignSubscriptionSchema = z.object({
  targetUserId: z.string().min(1),
  tier: z.nativeEnum(SubscriptionTier),
  startsAt: z.coerce.date()
});

export const assignInstructorSchema = z.object({
  subscriberId: z.string().min(1),
  instructorId: z.string().min(1)
});

export const uploadDocumentSchema = z.object({
  type: z.nativeEnum(DocumentType),
  side: z.nativeEnum(DocumentSide),
  fileName: z.string().trim().min(3).max(255),
  contentType: z.string().trim().min(3).max(120),
  sizeBytes: z.number().int().positive().max(100_000_000)
});

export const commitDocumentSchema = z.object({
  type: z.nativeEnum(DocumentType),
  side: z.nativeEnum(DocumentSide),
  storageKey: z.string().trim().min(3).max(600),
  fileName: z.string().trim().min(3).max(255),
  contentType: z.string().trim().min(3).max(120),
  sizeBytes: z.number().int().positive().max(100_000_000),
  sha256: z.string().trim().length(64),
  medicalCertificateExpiresAt: optionalDate
});

export const approveDocumentSchema = z.object({
  documentId: z.string().min(1),
  medicalCertificateExpiresAt: optionalDate
});

export const rejectDocumentSchema = z.object({
  documentId: z.string().min(1),
  rejectionReason: z.string().trim().min(4).max(400)
});

export const requestReuploadDocumentSchema = z.object({
  documentId: z.string().min(1),
  reason: z.string().trim().min(4).max(400).optional()
});

export const updatePersonalInfoSchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .max(30)
    .transform((value) => (value.length ? value : null)),
  address: z
    .string()
    .trim()
    .max(200)
    .transform((value) => (value.length ? value : null))
    .optional()
});
