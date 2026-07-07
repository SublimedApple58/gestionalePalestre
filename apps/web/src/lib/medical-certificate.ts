import { DocumentStatus, DocumentType, type UserDocument } from "@gestionale/db";

import { daysUntil } from "@/lib/association";

/**
 * Certificato medico dell'iscritto.
 * Soglia di preavviso in home admin: 30 giorni (≈ 1 mese).
 *
 * La scadenza vive sul documento `MEDICAL_CERTIFICATE` (impostata al caricamento
 * dall'iscritto o in fase di approvazione/modifica dall'admin), non sull'utente.
 */
export const MEDICAL_CERT_EXPIRY_THRESHOLD_DAYS = 30;

type CertDoc = Pick<UserDocument, "type" | "status" | "medicalCertificateExpiresAt">;

export type MedicalCertificateState =
  | { kind: "missing" } // nessun certificato approvato con scadenza segnata
  | { kind: "valid"; expiresAt: Date; days: number }
  | { kind: "soon"; expiresAt: Date; days: number }
  | { kind: "expired"; expiresAt: Date; days: number };

/**
 * Scadenza del certificato medico APPROVED dell'iscritto (null se assente o
 * non ancora approvato/senza data). Il certificato è unico per utente
 * (`@@unique([userId, type, side])`).
 */
export function getMedicalCertificateExpiry(documents: CertDoc[]): Date | null {
  const cert = documents.find(
    (d) =>
      d.type === DocumentType.MEDICAL_CERTIFICATE &&
      d.status === DocumentStatus.APPROVED &&
      d.medicalCertificateExpiresAt != null
  );
  return cert?.medicalCertificateExpiresAt ?? null;
}

export function medicalCertificateStatus(
  documents: CertDoc[],
  now: Date = new Date()
): MedicalCertificateState {
  const expiresAt = getMedicalCertificateExpiry(documents);
  if (!expiresAt) return { kind: "missing" };
  const days = daysUntil(expiresAt, now);
  if (days < 0) return { kind: "expired", expiresAt, days };
  if (days <= MEDICAL_CERT_EXPIRY_THRESHOLD_DAYS) return { kind: "soon", expiresAt, days };
  return { kind: "valid", expiresAt, days };
}
