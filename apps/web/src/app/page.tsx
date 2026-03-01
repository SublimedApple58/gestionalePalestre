import { db } from "@gestionale/db";

export const dynamic = "force-dynamic";

async function getDashboardData() {
  try {
    const [gyms, members] = await Promise.all([
      db.gym.count(),
      db.member.count()
    ]);

    return {
      gyms,
      members,
      dbConnected: true
    };
  } catch {
    return {
      gyms: 0,
      members: 0,
      dbConnected: false
    };
  }
}

export default async function HomePage() {
  const data = await getDashboardData();

  return (
    <main className="container">
      <header>
        <p className="eyebrow">Gestionale Palestre</p>
        <h1>Starter monorepo pronto per Vercel</h1>
        <p className="subtitle">
          Stack iniziale: Next.js + Prisma + Neon + Node.js
        </p>
      </header>

      <section className="cards">
        <article className="card">
          <h2>Palestre</h2>
          <strong>{data.gyms}</strong>
        </article>

        <article className="card">
          <h2>Iscritti</h2>
          <strong>{data.members}</strong>
        </article>

        <article className="card status">
          <h2>Database</h2>
          <strong>{data.dbConnected ? "Connesso" : "Non configurato"}</strong>
        </article>
      </section>

      <section className="next-steps">
        <h3>Prossimi step</h3>
        <ol>
          <li>Configura variabili Neon in `apps/web/.env.local` e `packages/db/.env`.</li>
          <li>Esegui `pnpm db:push` per creare le tabelle.</li>
          <li>Deploy su Vercel con root del progetto su repository root.</li>
        </ol>
      </section>
    </main>
  );
}
