import { AccessEventType, type PrismaClient, UserRole } from "@gestionale/db";

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

export type UserAccessEventRow = {
  id: string;
  eventType: AccessEventType;
  note: string | null;
  occurredAt: string;
};

/**
 * Storico accessi di un singolo iscritto, ordinato DESC. Cursor-based.
 * Include tutti i tipi (KEYPAD_UNLOCK/DOOR_OPEN/ENTRY_SIMULATION): nel dettaglio
 * dell'iscritto interessa la cronologia completa dei suoi ingressi.
 */
export async function listAccessEventsForUser(
  prisma: PrismaClient,
  userId: string,
  options: { cursor?: string; limit?: number } = {}
): Promise<{ items: UserAccessEventRow[]; nextCursor: string | null }> {
  const limit = Math.max(1, Math.min(100, options.limit ?? 30));

  const rows = await prisma.accessEvent.findMany({
    where: { userId },
    orderBy: { occurredAt: "desc" },
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    select: { id: true, eventType: true, note: true, occurredAt: true }
  });

  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: sliced.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      note: r.note,
      occurredAt: r.occurredAt.toISOString()
    })),
    nextCursor: hasMore ? sliced[sliced.length - 1]!.id : null
  };
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
