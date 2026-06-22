import { type PrismaClient, UserRole } from "@gestionale/db";

import { isSubscriptionActive } from "@/lib/subscription";

/**
 * Regola unica di autorizzazione all'accesso (tastierino/serratura).
 *
 * Identica alla logica storica in `tuya-pin-service` / `tuya-pin-migration`:
 *  - ADMIN e INSTRUCTOR: sempre;
 *  - SUBSCRIBER: solo con abbonamento attivo (`isSubscriptionActive`).
 *
 * NB: NON richiede i documenti (a differenza di `ensureSubscriberCanEnter`),
 * per non cambiare il comportamento attuale del controllo accessi.
 */
export type AccessAuthSubject = {
  role: UserRole;
  subscription:
    | { startsAt: Date; endsAt: Date; deactivatedAt?: Date | null }
    | null;
};

export function shouldHaveAccess(
  user: AccessAuthSubject,
  now: Date = new Date()
): boolean {
  return (
    user.role === UserRole.ADMIN ||
    user.role === UserRole.INSTRUCTOR ||
    (user.role === UserRole.SUBSCRIBER &&
      isSubscriptionActive(user.subscription, now))
  );
}

export type ActiveAccessCode = {
  userId: string;
  code: string;
  name: string;
  role: UserRole;
};

/**
 * Materializza la lista dei codici che DEVONO essere attivi sul tastierino
 * in questo momento. È la sorgente di verità che il servizio locale
 * (PC in palestra) sincronizza sulla tabella del device.
 */
export async function getActiveAccessCodes(
  prisma: PrismaClient,
  now: Date = new Date()
): Promise<ActiveAccessCode[]> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      accessCode: true,
      subscription: {
        select: { startsAt: true, endsAt: true, deactivatedAt: true },
      },
    },
  });

  return users
    .filter((u) => shouldHaveAccess(u, now))
    .map((u) => ({
      userId: u.id,
      code: u.accessCode,
      name: `${u.firstName} ${u.lastName}`,
      role: u.role,
    }));
}
