"use server";

import { db } from "@gestionale/db";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn, signOut } from "@/auth";
import { registerSubscriber } from "@/lib/services/user-service";
import { registerSchema } from "@/lib/validators/forms";

export async function registerAction(formData: FormData): Promise<void> {
  const parsed = registerSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password")
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
