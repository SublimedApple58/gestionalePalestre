import {
  type PrismaClient,
  SubscriptionTier,
  UserRole,
  type User
} from "@gestionale/db";
import { hash } from "bcryptjs";

import { generateAccessCode } from "@/lib/access-code";
import { computeSubscriptionEndDate } from "@/lib/subscription";

import { DomainError } from "./errors";

type RegisterSubscriberInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

type AdminCreateUserInput = RegisterSubscriberInput & {
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

type AssignInstructorInput = {
  subscriberId: string;
  instructorId: string;
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

  return prisma.user.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      passwordHash,
      role: UserRole.SUBSCRIBER,
      accessCode: generateAccessCode()
    }
  });
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

  return prisma.user.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      passwordHash,
      role: input.role,
      accessCode: generateAccessCode()
    }
  });
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

  return user;
}

export async function deleteUserByAdmin(
  prisma: PrismaClient,
  actorRole: UserRole,
  input: DeleteUserInput
): Promise<void> {
  assertAdminRole(actorRole);
  await assertNotLastAdmin(prisma, input.targetUserId);

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
    throw new DomainError("INVALID_ROLE", "L'abbonamento puo' essere assegnato solo agli abbonati.");
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
      assignedById: actorId
    }
  });
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
    throw new DomainError("INVALID_ROLE", "Solo un abbonato puo' ricevere un istruttore.");
  }

  if (instructor.role !== UserRole.INSTRUCTOR) {
    throw new DomainError("INVALID_ROLE", "L'utente selezionato non e' un istruttore.");
  }

  await prisma.user.update({
    where: { id: subscriber.id },
    data: { assignedInstructorId: instructor.id }
  });
}
