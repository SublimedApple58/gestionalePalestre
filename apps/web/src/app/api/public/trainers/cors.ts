/**
 * CORS dell'API pubblica trainer: la legge il sito houseofmuscle.it (altro
 * dominio). Dati pubblici e senza credenziali, ma ammettiamo solo i nostri
 * domini (+ localhost fuori produzione per lo sviluppo del sito).
 */
const ALLOWED_ORIGINS = new Set(["https://houseofmuscle.it", "https://www.houseofmuscle.it"]);

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const allowed =
    origin &&
    (ALLOWED_ORIGINS.has(origin) ||
      (process.env.VERCEL_ENV !== "production" && /^http:\/\/localhost:\d+$/.test(origin)));
  return {
    Vary: "Origin",
    ...(allowed
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Max-Age": "86400"
        }
      : {})
  };
}
