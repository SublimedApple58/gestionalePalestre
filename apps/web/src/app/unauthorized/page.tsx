import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Accesso negato</p>
        <h1>Permessi insufficienti</h1>
        <p className="subtitle">Il tuo ruolo non puo&apos; accedere a questa area.</p>
        <Link href="/dashboard" className="button button-primary">
          Torna alla dashboard
        </Link>
      </section>
    </main>
  );
}
