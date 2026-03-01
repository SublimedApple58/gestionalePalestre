import Link from "next/link";
import { redirect } from "next/navigation";

import { loginAction } from "@/app/actions/auth-actions";
import { getSessionUser } from "@/lib/session";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

function mapError(error?: string): string | null {
  switch (error) {
    case "credenziali-non-valide":
      return "Email o password non valide.";
    default:
      return null;
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
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
        <h1>Accedi</h1>
        <p className="subtitle">Area role-based per admin, istruttori e iscritti.</p>

        {error ? <p className="error-banner">{error}</p> : null}

        <form action={loginAction} className="grid-form">
          <label className="input-group">
            <span>Email</span>
            <input name="email" type="email" required placeholder="nome@dominio.com" />
          </label>

          <label className="input-group">
            <span>Password</span>
            <input name="password" type="password" required minLength={8} />
          </label>

          <button type="submit" className="button button-primary">
            Entra nel gestionale
          </button>
        </form>

        <p className="auth-footer">
          Non hai un account? <Link href="/register">Registrati</Link>
        </p>
      </section>
    </main>
  );
}
