import Link from "next/link";
import { redirect } from "next/navigation";

import { registerAction } from "@/app/actions/auth-actions";
import { getSessionUser } from "@/lib/session";

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
      return "Email gia' presente nel sistema.";
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
      <section className="auth-card">
        <p className="eyebrow">Gestionale Palestre</p>
        <h1>Registrati</h1>
        <p className="subtitle">Crei un account abbonato. Ruolo modificabile dall&apos;admin.</p>

        {error ? <p className="error-banner">{error}</p> : null}

        <form action={registerAction} className="grid-form">
          <label className="input-group">
            <span>Nome</span>
            <input name="firstName" required minLength={2} />
          </label>

          <label className="input-group">
            <span>Cognome</span>
            <input name="lastName" required minLength={2} />
          </label>

          <label className="input-group">
            <span>Email</span>
            <input name="email" type="email" required />
          </label>

          <label className="input-group">
            <span>Password</span>
            <input name="password" type="password" required minLength={8} />
          </label>

          <button type="submit" className="button button-primary">
            Crea account
          </button>
        </form>

        <p className="auth-footer">
          Hai gia&apos; un account? <Link href="/login">Vai al login</Link>
        </p>
      </section>
    </main>
  );
}
