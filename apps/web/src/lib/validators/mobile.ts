import { SubscriptionTier } from "@gestionale/db";
import { z } from "zod";

import { CHECKOUT_TIERS } from "@/lib/subscription";

/** Body POST /api/mobile/auth/login */
export const mobileLoginSchema = z.object({
  email: z.string().trim().email("Email non valida"),
  password: z.string().min(8, "Password minimo 8 caratteri").max(128)
});

/** Body POST /api/mobile/auth/refresh */
export const mobileRefreshSchema = z.object({
  refreshToken: z.string().min(20)
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
