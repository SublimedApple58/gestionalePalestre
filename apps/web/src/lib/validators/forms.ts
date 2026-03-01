import { SubscriptionTier, UserRole } from "@gestionale/db";
import { z } from "zod";

const email = z.string().trim().email("Email non valida");
const password = z
  .string()
  .min(8, "La password deve avere almeno 8 caratteri")
  .max(128, "La password e' troppo lunga");

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
