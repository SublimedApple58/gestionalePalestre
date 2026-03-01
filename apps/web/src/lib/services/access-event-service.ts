import { AccessEventType, type PrismaClient } from "@gestionale/db";

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
  const subscription = await prisma.userSubscription.findUnique({
    where: { userId },
    select: { startsAt: true, endsAt: true }
  });

  if (!subscription) {
    throw new DomainError("SUBSCRIPTION_INACTIVE", "Nessun abbonamento attivo.");
  }

  if (now < subscription.startsAt || now > subscription.endsAt) {
    throw new DomainError("SUBSCRIPTION_INACTIVE", "Abbonamento non attivo.");
  }
}
