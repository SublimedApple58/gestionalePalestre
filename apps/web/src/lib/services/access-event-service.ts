import { AccessEventType, type PrismaClient, UserRole } from "@gestionale/db";

import { shouldHaveAccess } from "@/lib/access/authorization";
import { hasRequiredDocuments } from "@/lib/documents";
import { openDoor as openTuyaDoor } from "@/lib/tuya/access-control";

import { DomainError } from "./errors";

/**
 * Apre fisicamente la porta della palestra (via Tuya cloud → keypad WiFi)
 * e poi registra l'evento DOOR_OPEN.
 *
 * Se la chiamata Tuya fallisce (env mancanti, device offline, cloud Tuya KO)
 * la funzione lancia eccezione e l'evento NON viene loggato — così non
 * mostriamo "Porta aperta" all'admin se la serratura non si è davvero mossa.
 */
export async function recordDoorOpen(prisma: PrismaClient, userId: string): Promise<void> {
  // Hardware first: se Tuya rifiuta non logghiamo un evento falso.
  await openTuyaDoor();

  await prisma.accessEvent.create({
    data: {
      userId,
      eventType: AccessEventType.DOOR_OPEN,
      note: "CTA Apri porta palestra"
    }
  });
}

export type KeypadUnlockResult = {
  matched: boolean;
  userId?: string;
  ambiguous?: boolean;
};

/**
 * Registra uno sblocco avvenuto sul tastierino locale (riportato dal servizio
 * sul PC in palestra). Mappa il codice digitato all'utente.
 *
 * `accessCode` non è garantito unico: se più utenti condividono il codice si
 * preferisce quello attualmente autorizzato; si segnala `ambiguous`.
 */
export async function recordKeypadUnlock(
  prisma: PrismaClient,
  params: { code: string; occurredAt?: Date; method?: string }
): Promise<KeypadUnlockResult> {
  const candidates = await prisma.user.findMany({
    where: { accessCode: params.code },
    select: {
      id: true,
      role: true,
      subscription: {
        select: { startsAt: true, endsAt: true, deactivatedAt: true },
      },
    },
  });

  if (candidates.length === 0) {
    return { matched: false };
  }

  const chosen = candidates.find((u) => shouldHaveAccess(u)) ?? candidates[0]!;
  const ambiguous = candidates.length > 1;

  const noteParts = [`Sblocco tastierino${params.method ? ` (${params.method})` : ""}`];
  if (ambiguous) {
    noteParts.push(`codice condiviso da ${candidates.length} utenti`);
  }

  await prisma.accessEvent.create({
    data: {
      userId: chosen.id,
      eventType: AccessEventType.KEYPAD_UNLOCK,
      note: noteParts.join(" — "),
      ...(params.occurredAt ? { occurredAt: params.occurredAt } : {}),
    },
  });

  return { matched: true, userId: chosen.id, ambiguous };
}

export async function ensureSubscriberCanEnter(
  prisma: PrismaClient,
  userId: string,
  now: Date = new Date()
): Promise<void> {
  const [subscription, documents] = await Promise.all([
    prisma.userSubscription.findUnique({
      where: { userId },
      select: { startsAt: true, endsAt: true }
    }),
    prisma.userDocument.findMany({
      where: { userId },
      select: {
        type: true,
        side: true,
        status: true,
        medicalCertificateExpiresAt: true
      }
    })
  ]);

  if (!subscription) {
    throw new DomainError("SUBSCRIPTION_INACTIVE", "Nessun abbonamento attivo.");
  }

  if (now < subscription.startsAt || now > subscription.endsAt) {
    throw new DomainError("SUBSCRIPTION_INACTIVE", "Abbonamento non attivo.");
  }

  const documentsReady = hasRequiredDocuments(UserRole.SUBSCRIBER, documents, now);

  if (!documentsReady) {
    throw new DomainError(
      "MISSING_REQUIRED_DOCUMENTS",
      "Per l'accesso e' necessario avere codice fiscale e documento di identita' fronte/retro approvati e certificato medico approvato/non scaduto."
    );
  }
}
