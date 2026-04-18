import { Cake } from "lucide-react";

import { db } from "@gestionale/db";

/**
 * Server component: elenco compleanni di oggi + domani per la dashboard admin.
 * Se non ci sono compleanni rilevanti nel range, non renderizza nulla (evita banner vuoto).
 *
 * Il filtro mese+giorno è fatto in memoria per semplicità: il numero di iscritti
 * in una palestra non giustifica query su `EXTRACT(MONTH/DAY FROM ...)` con index dedicati.
 */
export async function BirthdayBanner() {
  const users = await db.user.findMany({
    where: { dateOfBirth: { not: null } },
    select: { id: true, firstName: true, lastName: true, dateOfBirth: true }
  });

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todaysBirthdays = users.filter((u) => sameMonthDay(u.dateOfBirth!, today));
  const tomorrowsBirthdays = users.filter((u) => sameMonthDay(u.dateOfBirth!, tomorrow));

  if (todaysBirthdays.length === 0 && tomorrowsBirthdays.length === 0) {
    return null;
  }

  return (
    <section className="birthday-banner" aria-label="Compleanni della palestra">
      <div className="birthday-banner-icon">
        <Cake size={20} aria-hidden="true" />
      </div>
      <div className="birthday-banner-body">
        {todaysBirthdays.length > 0 ? (
          <div className="birthday-banner-row">
            <span className="birthday-banner-tag today">Oggi</span>
            <p className="birthday-banner-text">
              Auguri a{" "}
              <strong>
                {todaysBirthdays
                  .map((u) => `${u.firstName} ${u.lastName}`)
                  .join(", ")}
              </strong>
              . Un messaggio di auguri è sempre un bel gesto.
            </p>
          </div>
        ) : null}

        {tomorrowsBirthdays.length > 0 ? (
          <div className="birthday-banner-row">
            <span className="birthday-banner-tag tomorrow">Domani</span>
            <p className="birthday-banner-text">
              Compleann{tomorrowsBirthdays.length === 1 ? "o" : "i"} in arrivo:{" "}
              <strong>
                {tomorrowsBirthdays
                  .map((u) => `${u.firstName} ${u.lastName}`)
                  .join(", ")}
              </strong>
              .
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function sameMonthDay(a: Date, b: Date): boolean {
  const da = new Date(a);
  return da.getUTCMonth() === b.getUTCMonth() && da.getUTCDate() === b.getUTCDate();
}
