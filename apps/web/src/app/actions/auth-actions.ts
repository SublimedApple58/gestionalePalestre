"use server";

import { db } from "@gestionale/db";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn, signOut } from "@/auth";
import { DomainError } from "@/lib/services/errors";
import {
  requestPasswordReset,
  resetPasswordWithCode
} from "@/lib/services/password-reset-service";
import { registerSubscriber } from "@/lib/services/user-service";
import { registerSchema } from "@/lib/validators/forms";

export type ResetActionState = {
  status: "success" | "error";
  message?: string;
};

function mapResetError(code: string): string {
  switch (code) {
    case "CODE_EXPIRED":
      return "Il codice è scaduto. Richiedine uno nuovo.";
    case "TOO_MANY_ATTEMPTS":
      return "Troppi tentativi. Richiedi un nuovo codice.";
    case "WEAK_PASSWORD":
      return "La password deve avere almeno 8 caratteri.";
    case "INVALID_CODE":
    default:
      return "Codice non valido.";
  }
}

export async function registerAction(formData: FormData): Promise<void> {
  const parsed = registerSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
    phoneNumber: formData.get("phoneNumber"),
    address: formData.get("address") ?? undefined
  });

  if (!parsed.success) {
    redirect("/register?error=formato-non-valido");
  }

  try {
    await registerSubscriber(db, parsed.data);
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/dashboard"
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login?error=credenziali-non-valide");
    }

    redirect("/register?error=email-gia-registrata");
  }
}

export async function loginAction(formData: FormData): Promise<void> {
  const email = formData.get("email")?.toString() ?? "";
  const password = formData.get("password")?.toString() ?? "";

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard"
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login?error=credenziali-non-valide");
    }

    throw error;
  }
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

/**
 * Step 1 reset password: invia il codice via email.
 * Ritorna sempre "success" anche se l'email non esiste (anti-enumerazione).
 */
export async function requestPasswordResetAction(
  email: string
): Promise<ResetActionState> {
  const trimmed = email.trim();
  if (!trimmed || !trimmed.includes("@")) {
    return { status: "error", message: "Inserisci un'email valida." };
  }

  await requestPasswordReset(db, trimmed);
  return { status: "success" };
}

/**
 * Step 2 reset password: verifica il codice e imposta la nuova password.
 */
export async function resetPasswordAction(input: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<ResetActionState> {
  try {
    await resetPasswordWithCode(db, input);
    return { status: "success" };
  } catch (error) {
    if (error instanceof DomainError) {
      return { status: "error", message: mapResetError(error.code) };
    }
    return { status: "error", message: "Si è verificato un errore. Riprova." };
  }
}
