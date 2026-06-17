import { randomInt } from "crypto";

import { type PrismaClient } from "@gestionale/db";
import { compare, hash } from "bcryptjs";

import { sendEmail } from "@/lib/email/send";
import { PasswordResetCodeEmail } from "@/lib/email/templates/password-reset-code";

import { DomainError } from "./errors";

/** Validità del codice OTP. */
const CODE_TTL_MS = 15 * 60 * 1000; // 15 minuti
/** Tentativi errati massimi prima di invalidare il codice. */
const MAX_ATTEMPTS = 5;
/** Anti-spam: non reinviare un nuovo codice se l'ultimo è più recente di così. */
const RESEND_THROTTLE_MS = 60 * 1000; // 60 secondi
/** Costo bcrypt per il codice (effimero → più basso del password hash). */
const CODE_HASH_ROUNDS = 10;
/** Costo bcrypt per la password (allineato a user-service). */
const PASSWORD_HASH_ROUNDS = 12;

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * Step 1 del reset: genera e invia un codice OTP via email.
 *
 * IMPORTANTE: non rivela mai se l'email esiste o meno (anti-enumerazione):
 * ritorna sempre senza errori. Throttle a 60s per evitare spam di email.
 */
export async function requestPasswordReset(
  prisma: PrismaClient,
  rawEmail: string
): Promise<void> {
  const email = rawEmail.trim();
  if (!email) return;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, firstName: true },
  });

  // Email inesistente → usciamo in silenzio (stessa risposta lato chiamante).
  if (!user) return;

  // Throttle: se c'è un codice ancora valido emesso da poco, non ne creiamo un altro.
  const recent = await prisma.passwordResetCode.findFirst({
    where: { userId: user.id, consumedAt: null },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (recent && Date.now() - recent.createdAt.getTime() < RESEND_THROTTLE_MS) {
    return;
  }

  // Invalida eventuali codici precedenti non consumati.
  await prisma.passwordResetCode.updateMany({
    where: { userId: user.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = generateCode();
  const codeHash = await hash(code, CODE_HASH_ROUNDS);

  await prisma.passwordResetCode.create({
    data: {
      userId: user.id,
      codeHash,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });

  await sendEmail({
    to: user.email,
    subject: "Codice per reimpostare la password",
    react: PasswordResetCodeEmail({ code, firstName: user.firstName }),
  });
}

type ResetInput = {
  email: string;
  code: string;
  newPassword: string;
};

/**
 * Step 2 del reset: verifica il codice e imposta la nuova password.
 *
 * Errori (DomainError.code):
 *  - WEAK_PASSWORD     → password fuori dai vincoli (8–128)
 *  - INVALID_CODE      → codice errato o nessun codice valido
 *  - CODE_EXPIRED      → codice scaduto
 *  - TOO_MANY_ATTEMPTS → superato il limite di tentativi
 */
export async function resetPasswordWithCode(
  prisma: PrismaClient,
  input: ResetInput
): Promise<void> {
  const email = input.email.trim();
  const code = input.code.trim();
  const { newPassword } = input;

  if (newPassword.length < 8 || newPassword.length > 128) {
    throw new DomainError(
      "WEAK_PASSWORD",
      "La password deve avere almeno 8 caratteri."
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  // Risposta generica anche se l'utente non esiste (anti-enumerazione).
  if (!user) {
    throw new DomainError("INVALID_CODE", "Codice non valido.");
  }

  const record = await prisma.passwordResetCode.findFirst({
    where: { userId: user.id, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    throw new DomainError("INVALID_CODE", "Codice non valido.");
  }

  if (record.expiresAt.getTime() < Date.now()) {
    throw new DomainError("CODE_EXPIRED", "Il codice è scaduto.");
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    throw new DomainError(
      "TOO_MANY_ATTEMPTS",
      "Troppi tentativi. Richiedi un nuovo codice."
    );
  }

  const isValid = await compare(code, record.codeHash);
  if (!isValid) {
    await prisma.passwordResetCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    throw new DomainError("INVALID_CODE", "Codice non valido.");
  }

  const passwordHash = await hash(newPassword, PASSWORD_HASH_ROUNDS);

  // Aggiorna la password e brucia tutti i codici dell'utente in un colpo solo.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    }),
    prisma.passwordResetCode.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
  ]);
}
