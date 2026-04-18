import { Resend } from "resend";

/**
 * Singleton `Resend`. In dev senza RESEND_API_KEY il client è null e `sendEmail` logga
 * il contenuto invece di inviare, così non serve una chiave valida per lavorare in locale.
 */
let cached: Resend | null | undefined;

export function getResend(): Resend | null {
  if (cached !== undefined) return cached;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY non impostata — le email saranno loggate a console invece di essere inviate.");
    cached = null;
    return cached;
  }

  cached = new Resend(apiKey);
  return cached;
}

export function isEmailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}
