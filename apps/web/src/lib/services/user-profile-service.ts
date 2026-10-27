import { DocumentType, Prisma, UserRole, type PrismaClient } from "@gestionale/db";

import { DomainError } from "@/lib/services/errors";
import type { AdminUpdateProfileInput } from "@/lib/validators/forms";

/**
 * Anagrafica dell'iscritto modificabile dall'admin dalla scheda in /utenti.
 *
 * - L'email e' il login (web e app): unicita' controllata senza distinguere
 *   maiuscole, cosi' non nascono due account "Mario@x.it" / "mario@x.it".
 *   Le sessioni restano valide: web e mobile identificano l'utente per id.
 * - Il codice fiscale non ha un campo sull'utente: vive sui documenti
 *   TAX_CODE (valore estratto dall'AI). Correggerlo = correggere quel valore,
 *   quindi serve che la tessera sia stata caricata.
 * - La data di nascita si salva a mezzanotte UTC, come fa l'estrazione AI
 *   (il job compleanni confronta mese/giorno in UTC).
 */

export type ProfileSnapshot = {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
  address: string | null;
  dateOfBirth: string | null;
  taxCode: string | null;
};

export type ProfileField = keyof ProfileSnapshot;

export type ProfileUpdateResult = {
  changed: ProfileField[];
  before: Partial<ProfileSnapshot>;
  after: Partial<ProfileSnapshot>;
  tuyaUserId: string | null;
};

const FIELDS: ProfileField[] = [
  "firstName",
  "lastName",
  "email",
  "phoneNumber",
  "address",
  "dateOfBirth",
  "taxCode"
];

/** Date → "YYYY-MM-DD" letta in UTC (le date di nascita sono a mezzanotte UTC). */
export function dateOfBirthToYmd(date: Date | null): string | null {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

export async function updateUserProfileByAdmin(
  prisma: PrismaClient,
  actorRole: UserRole,
  input: AdminUpdateProfileInput
): Promise<ProfileUpdateResult> {
  if (actorRole !== UserRole.ADMIN) {
    throw new DomainError("FORBIDDEN", "Solo gli admin possono modificare l'anagrafica.");
  }

  const user = await prisma.user.findUnique({
    where: { id: input.targetUserId },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      phoneNumber: true,
      address: true,
      dateOfBirth: true,
      tuyaUserId: true,
      documents: {
        where: { type: DocumentType.TAX_CODE },
        select: { extractedTaxCode: true }
      }
    }
  });

  if (!user) {
    throw new DomainError("USER_NOT_FOUND", "Utente non trovato.");
  }

  const hasTaxCodeDocument = user.documents.length > 0;
  const before: ProfileSnapshot = {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    address: user.address,
    dateOfBirth: dateOfBirthToYmd(user.dateOfBirth),
    taxCode: user.documents.find((d) => d.extractedTaxCode)?.extractedTaxCode ?? null
  };
  const next: ProfileSnapshot = {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phoneNumber: input.phoneNumber,
    address: input.address,
    dateOfBirth: input.dateOfBirth,
    taxCode: input.taxCode
  };

  const changed = FIELDS.filter((field) => before[field] !== next[field]);
  const result: ProfileUpdateResult = {
    changed,
    before: Object.fromEntries(changed.map((f) => [f, before[f]])),
    after: Object.fromEntries(changed.map((f) => [f, next[f]])),
    tuyaUserId: user.tuyaUserId
  };

  if (changed.length === 0) {
    return result;
  }

  if (changed.includes("taxCode") && !hasTaxCodeDocument) {
    throw new DomainError(
      "TAX_CODE_NO_DOCUMENT",
      "Il codice fiscale si salva sulla tessera sanitaria: caricala prima nella scheda Documenti."
    );
  }

  if (changed.includes("email")) {
    const clash = await prisma.user.findFirst({
      where: {
        id: { not: input.targetUserId },
        email: { equals: next.email, mode: "insensitive" }
      },
      select: { id: true }
    });
    if (clash) {
      throw new DomainError("EMAIL_EXISTS", "Questa email e' gia' usata da un altro account.");
    }
  }

  const userData: Prisma.UserUpdateInput = {};
  for (const field of changed) {
    if (field === "taxCode") continue;
    if (field === "dateOfBirth") {
      userData.dateOfBirth = next.dateOfBirth ? new Date(`${next.dateOfBirth}T00:00:00.000Z`) : null;
    } else {
      (userData as Record<string, unknown>)[field] = next[field];
    }
  }

  try {
    await prisma.$transaction([
      prisma.user.update({ where: { id: input.targetUserId }, data: userData }),
      ...(changed.includes("taxCode")
        ? [
            prisma.userDocument.updateMany({
              where: { userId: input.targetUserId, type: DocumentType.TAX_CODE },
              data: { extractedTaxCode: next.taxCode }
            })
          ]
        : [])
    ]);
  } catch (error) {
    // Corsa con un'altra registrazione sulla stessa email: vince il vincolo unico.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DomainError("EMAIL_EXISTS", "Questa email e' gia' usata da un altro account.");
    }
    throw error;
  }

  return result;
}
