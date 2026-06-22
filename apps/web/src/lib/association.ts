/**
 * Iscrizione ad associazione sportiva esterna.
 * Soglia di preavviso in home admin: 14 giorni.
 */
export const ASSOCIATION_EXPIRY_THRESHOLD_DAYS = 14;

/** Giorni interi da oggi alla data (negativo se passata). */
export function daysUntil(date: Date, now: Date = new Date()): number {
  const a = new Date(date);
  a.setHours(0, 0, 0, 0);
  const b = new Date(now);
  b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

export type AssociationState =
  | { kind: "none" }
  | { kind: "valid"; days?: number }
  | { kind: "soon"; days: number }
  | { kind: "expired"; days: number };

export function associationStatus(
  member: boolean,
  expiresAt: Date | null,
  now: Date = new Date()
): AssociationState {
  if (!member) return { kind: "none" };
  if (!expiresAt) return { kind: "valid" };
  const days = daysUntil(expiresAt, now);
  if (days < 0) return { kind: "expired", days };
  if (days <= ASSOCIATION_EXPIRY_THRESHOLD_DAYS) return { kind: "soon", days };
  return { kind: "valid", days };
}
