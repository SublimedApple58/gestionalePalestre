/**
 * Formattazione date/orari SEMPRE nel fuso della palestra (Europe/Rome).
 *
 * Perché serve: i Server Components girano su Vercel in UTC. Senza `timeZone`
 * esplicito, `toLocaleString`/`toLocaleDateString` usano il fuso del runtime (UTC)
 * → gli orari mostrati risultano indietro di 1-2h rispetto all'orario reale in
 * Italia (2h con l'ora legale). Forziamo sempre Europe/Rome così l'orario mostrato
 * è quello locale della palestra, indipendentemente da dove gira il render.
 */
const GYM_TIME_ZONE = "Europe/Rome";

/** Data + ora (es. "20/07/2026, 14:35"). Per orari d'ingresso, pagamenti, audit. */
export function formatRomeDateTime(value: Date | string | number): string {
  return new Date(value).toLocaleString("it-IT", { timeZone: GYM_TIME_ZONE });
}

/** Solo data (es. "20/07/2026"). Per scadenze e simili. */
export function formatRomeDate(value: Date | string | number): string {
  return new Date(value).toLocaleDateString("it-IT", { timeZone: GYM_TIME_ZONE });
}

/** ms da aggiungere a un istante UTC per ottenere l'orario a muro di Roma. */
function romeOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: GYM_TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(at);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(m.year),
    Number(m.month) - 1,
    Number(m.day),
    Number(m.hour === "24" ? "0" : m.hour),
    Number(m.minute),
    Number(m.second)
  );
  return asUtc - at.getTime();
}

/**
 * Istante UTC corrispondente alla mezzanotte (inizio giornata) di `ymd`
 * (formato YYYY-MM-DD) interpretato nel fuso della palestra (Europe/Rome).
 * Serve per filtrare per "giorno italiano" colonne DateTime salvate in UTC.
 */
export function romeDayStartUtc(ymd: string): Date {
  const parts = ymd.split("-");
  const y = Number(parts[0]);
  const mo = Number(parts[1]);
  const d = Number(parts[2]);
  const guess = Date.UTC(y, mo - 1, d, 0, 0, 0);
  const offset = romeOffsetMs(new Date(guess));
  return new Date(guess - offset);
}

/** Istante UTC di inizio del giorno SUCCESSIVO a `ymd` (bound superiore esclusivo). */
export function romeDayEndExclusiveUtc(ymd: string): Date {
  const parts = ymd.split("-");
  const y = Number(parts[0]);
  const mo = Number(parts[1]);
  const d = Number(parts[2]);
  const next = new Date(Date.UTC(y, mo - 1, d + 1));
  const nymd = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  return romeDayStartUtc(nymd);
}

export { GYM_TIME_ZONE };
