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

export { GYM_TIME_ZONE };
