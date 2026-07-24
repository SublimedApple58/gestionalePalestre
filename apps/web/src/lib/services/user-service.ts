import {
  type PrismaClient,
  SubscriptionTier,
  UserRole,
  type User
} from "@gestionale/db";
import { hash } from "bcryptjs";

import { generateAccessCode } from "@/lib/access-code";
import { computeSubscriptionEndDate, isEligibleForDoorAccess } from "@/lib/subscription";

import { DomainError } from "./errors";
import { removeTuyaUserCompletely, safeSyncPinToKeypad } from "./tuya-pin-service";

type RegisterSubscriberInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phoneNumber: string;
  address?: string;
};

// L'admin crea utenti senza imporre il telefono (lo screen-gate mobile lo
// richiedera' all'utente al primo accesso).
type AdminCreateUserInput = Omit<RegisterSubscriberInput, "phoneNumber"> & {
  role: UserRole;
};

type UpdateRoleInput = {
  targetUserId: string;
  role: UserRole;
};

type DeleteUserInput = {
  targetUserId: string;
};

type AssignSubscriptionInput = {
  targetUserId: string;
  tier: SubscriptionTier;
  startsAt: Date;
};

type AssignEntryPackageInput = {
  targetUserId: string;
  totalEntries: number;
};

type AssignInstructorInput = {
  subscriberId: string;
  instructorId: string;
};

type UpdatePersonalInfoInput = {
  userId: string;
  phoneNumber: string | null;
  address?: string | null;
};

function assertAdminRole(actorRole: UserRole): void {
  if (actorRole !== UserRole.ADMIN) {
    throw new DomainError("FORBIDDEN", "Solo un admin puo' eseguire questa azione.");
  }
}

async function assertNotLastAdmin(prisma: PrismaClient, targetUserId: string): Promise<void> {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { role: true }
  });

  if (!target) {
    throw new DomainError("NOT_FOUND", "Utente non trovato.");
  }

  if (target.role !== UserRole.ADMIN) {
    return;
  }

  const adminsCount = await prisma.user.count({
    where: { role: UserRole.ADMIN }
  });

  if (adminsCount <= 1) {
    throw new DomainError("LAST_ADMIN", "Non puoi modificare o eliminare l'ultimo admin.");
  }
}

export async function registerSubscriber(
  prisma: PrismaClient,
  input: RegisterSubscriberInput
): Promise<User> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email }
  });

  if (existing) {
    throw new DomainError("EMAIL_EXISTS", "Email gia' registrata.");
  }

  const passwordHash = await hash(input.password, 12);

  const user = await prisma.user.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      passwordHash,
      role: UserRole.SUBSCRIBER,
      accessCode: generateAccessCode(),
      phoneNumber: input.phoneNumber,
      ...(input.address ? { address: input.address } : {})
    }
  });

  safeSyncPinToKeypad(prisma, user.id);

  return user;
}

export async function createUserByAdmin(
  prisma: PrismaClient,
  actorRole: UserRole,
  input: AdminCreateUserInput
): Promise<User> {
  assertAdminRole(actorRole);

  const existing = await prisma.user.findUnique({
    where: { email: input.email }
  });

  if (existing) {
    throw new DomainError("EMAIL_EXISTS", "Email gia' registrata.");
  }

  const passwordHash = await hash(input.password, 12);

  const user = await prisma.user.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      passwordHash,
      role: input.role,
      accessCode: generateAccessCode()
    }
  });

  safeSyncPinToKeypad(prisma, user.id);

  return user;
}

export async function updateUserRoleByAdmin(
  prisma: PrismaClient,
  actorRole: UserRole,
  input: UpdateRoleInput
): Promise<User> {
  assertAdminRole(actorRole);

  if (input.role !== UserRole.ADMIN) {
    await assertNotLastAdmin(prisma, input.targetUserId);
  }

  const user = await prisma.user.update({
    where: { id: input.targetUserId },
    data: { role: input.role }
  });

  if (input.role !== UserRole.SUBSCRIBER) {
    await prisma.user.updateMany({
      where: { assignedInstructorId: user.id },
      data: { assignedInstructorId: null }
    });
  }

  safeSyncPinToKeypad(prisma, user.id);

  return user;
}

export async function deleteUserByAdmin(
  prisma: PrismaClient,
  actorRole: UserRole,
  input: DeleteUserInput
): Promise<void> {
  assertAdminRole(actorRole);
  await assertNotLastAdmin(prisma, input.targetUserId);

  try {
    await removeTuyaUserCompletely(prisma, input.targetUserId);
  } catch (e) {
    console.error(`[tuya-pin] Failed to remove Tuya user for ${input.targetUserId}:`, e);
  }

  await prisma.user.delete({
    where: { id: input.targetUserId }
  });
}

export async function assignSubscriptionByAdmin(
  prisma: PrismaClient,
  actorRole: UserRole,
  actorId: string,
  input: AssignSubscriptionInput
): Promise<void> {
  assertAdminRole(actorRole);

  const user = await prisma.user.findUnique({
    where: { id: input.targetUserId },
    select: { role: true }
  });

  if (!user) {
    throw new DomainError("NOT_FOUND", "Utente non trovato.");
  }

  if (user.role !== UserRole.SUBSCRIBER) {
    throw new DomainError("INVALID_ROLE", "L'abbonamento puo' essere assegnato solo agli iscritti.");
  }

  const endsAt = computeSubscriptionEndDate(input.tier, input.startsAt);

  await prisma.userSubscription.upsert({
    where: { userId: input.targetUserId },
    create: {
      userId: input.targetUserId,
      tier: input.tier,
      startsAt: input.startsAt,
      endsAt,
      assignedById: actorId
    },
    update: {
      tier: input.tier,
      startsAt: input.startsAt,
      endsAt,
      assignedById: actorId,
      // Assegnazione manuale = termine nuovo, non e' piu' disdetto.
      canceledAt: null
    }
  });

  // Assegnare un abbonamento SOVRASCRIVE/annulla un eventuale pacchetto ingressi
  // (mutuamente esclusivi). No-op se non esiste. Il successivo safeSyncPinToKeypad
  // riconcilia il PIN in base al nuovo abbonamento.
  await prisma.userEntryPackage.updateMany({
    where: { userId: input.targetUserId, deactivatedAt: null },
    data: { deactivatedAt: new Date(), remainingEntries: 0 }
  });

  safeSyncPinToKeypad(prisma, input.targetUserId);
}

/**
 * Assegna (admin-only) un pacchetto ingressi a consumo a un iscritto SENZA
 * abbonamento attivo. Reset totale su riassegnazione (nuova finestra `startsAt`).
 * Blocca se l'utente ha già un abbonamento door-eligible (mutua esclusività).
 */
export async function assignEntryPackageByAdmin(
  prisma: PrismaClient,
  actorRole: UserRole,
  actorId: string,
  input: AssignEntryPackageInput
): Promise<void> {
  assertAdminRole(actorRole);

  const user = await prisma.user.findUnique({
    where: { id: input.targetUserId },
    select: {
      role: true,
      subscription: { select: { startsAt: true, endsAt: true, deactivatedAt: true } }
    }
  });

  if (!user) {
    throw new DomainError("NOT_FOUND", "Utente non trovato.");
  }

  if (user.role !== UserRole.SUBSCRIBER) {
    throw new DomainError(
      "INVALID_ROLE",
      "Il pacchetto ingressi puo' essere assegnato solo agli iscritti."
    );
  }

  if (isEligibleForDoorAccess(user.subscription)) {
    throw new DomainError(
      "HAS_ACTIVE_SUBSCRIPTION",
      "Questo utente ha un abbonamento attivo: rimuovilo prima di assegnare un pacchetto ingressi."
    );
  }

  if (!Number.isInteger(input.totalEntries) || input.totalEntries < 1) {
    throw new DomainError("INVALID_ENTRIES", "Il numero di ingressi deve essere almeno 1.");
  }

  const now = new Date();
  await prisma.userEntryPackage.upsert({
    where: { userId: input.targetUserId },
    create: {
      userId: input.targetUserId,
      totalEntries: input.totalEntries,
      remainingEntries: input.totalEntries,
      startsAt: now,
      assignedById: actorId
    },
    update: {
      totalEntries: input.totalEntries,
      remainingEntries: input.totalEntries,
      startsAt: now,
      deactivatedAt: null,
      assignedById: actorId
    }
  });

  safeSyncPinToKeypad(prisma, input.targetUserId);
}

/** Rimuove/annulla (admin-only) il pacchetto ingressi di un utente. No-op se assente. */
export async function removeEntryPackageByAdmin(
  prisma: PrismaClient,
  actorRole: UserRole,
  _actorId: string,
  input: { targetUserId: string }
): Promise<void> {
  assertAdminRole(actorRole);

  await prisma.userEntryPackage.updateMany({
    where: { userId: input.targetUserId, deactivatedAt: null },
    data: { deactivatedAt: new Date(), remainingEntries: 0 }
  });

  safeSyncPinToKeypad(prisma, input.targetUserId);
}

export async function assignInstructorByAdmin(
  prisma: PrismaClient,
  actorRole: UserRole,
  input: AssignInstructorInput
): Promise<void> {
  assertAdminRole(actorRole);

  const [subscriber, instructor] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.subscriberId },
      select: { id: true, role: true }
    }),
    prisma.user.findUnique({
      where: { id: input.instructorId },
      select: { id: true, role: true }
    })
  ]);

  if (!subscriber || !instructor) {
    throw new DomainError("NOT_FOUND", "Utente non trovato.");
  }

  if (subscriber.role !== UserRole.SUBSCRIBER) {
    throw new DomainError("INVALID_ROLE", "Solo un iscritto puo' ricevere un istruttore.");
  }

  if (instructor.role !== UserRole.INSTRUCTOR) {
    throw new DomainError("INVALID_ROLE", "L'utente selezionato non e' un istruttore.");
  }

  await prisma.user.update({
    where: { id: subscriber.id },
    data: { assignedInstructorId: instructor.id }
  });
}

export async function updatePersonalInfo(
  prisma: PrismaClient,
  input: UpdatePersonalInfoInput
): Promise<void> {
  await prisma.user.update({
    where: { id: input.userId },
    data: {
      phoneNumber: input.phoneNumber,
      ...(input.address !== undefined && { address: input.address })
    }
  });
}
