import { AccessEventType, type PrismaClient, UserRole } from "@gestionale/db";

import { hasRequiredDocuments } from "@/lib/documents";

import { DomainError } from "./errors";

export async function recordEntrySimulation(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.accessEvent.create({
    data: {
      userId,
      eventType: AccessEventType.ENTRY_SIMULATION,
      note: "Ingresso simulato"
    }
  });
}

export async function recordDoorOpen(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.accessEvent.create({
    data: {
      userId,
      eventType: AccessEventType.DOOR_OPEN,
      note: "CTA Apri porta palestra"
    }
  });
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
