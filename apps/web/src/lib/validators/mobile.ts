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
