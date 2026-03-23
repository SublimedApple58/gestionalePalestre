import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/session";
import { RegisterForm } from "@/components/auth/register-form";

type RegisterPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

function mapError(error?: string): string | null {
  switch (error) {
    case "formato-non-valido":
      return "Controlla i campi inseriti e riprova.";
    case "email-gia-registrata":
      return "Email già presente nel sistema.";
    default:
      return null;
  }
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const user = await getSessionUser();

  if (user) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const error = mapError(params.error);

  return (
    <main className="auth-shell">
      <RegisterForm error={error} />
    </main>
  );
}
