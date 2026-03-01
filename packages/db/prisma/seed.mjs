import { PrismaClient, SubscriptionTier, UserRole } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "umberto.giancola00@gmail.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Castiglione1!";

function addMonths(date, months) {
  const value = new Date(date);
  value.setMonth(value.getMonth() + months);
  return value;
}

function buildSubscriptionRange(tier, startsAt = new Date()) {
  const normalizedStart = new Date(startsAt);

  switch (tier) {
    case SubscriptionTier.MONTHLY:
      return { startsAt: normalizedStart, endsAt: addMonths(normalizedStart, 1) };
    case SubscriptionTier.QUARTERLY:
      return { startsAt: normalizedStart, endsAt: addMonths(normalizedStart, 3) };
    case SubscriptionTier.YEARLY:
      return { startsAt: normalizedStart, endsAt: addMonths(normalizedStart, 12) };
    default:
      return { startsAt: normalizedStart, endsAt: addMonths(normalizedStart, 1) };
  }
}

async function upsertUser({ firstName, lastName, email, role, accessCode, passwordHash, assignedInstructorId = null }) {
  return prisma.user.upsert({
    where: { email },
    update: {
      firstName,
      lastName,
      role,
      accessCode,
      passwordHash,
      assignedInstructorId
    },
    create: {
      firstName,
      lastName,
      email,
      role,
      accessCode,
      passwordHash,
      assignedInstructorId
    }
  });
}

async function upsertSubscription({ userId, tier, assignedById, startsAt }) {
  const range = buildSubscriptionRange(tier, startsAt);

  return prisma.userSubscription.upsert({
    where: { userId },
    update: {
      tier,
      startsAt: range.startsAt,
      endsAt: range.endsAt,
      assignedById
    },
    create: {
      userId,
      tier,
      startsAt: range.startsAt,
      endsAt: range.endsAt,
      assignedById
    }
  });
}

async function main() {
  const adminPasswordHash = await hash(ADMIN_PASSWORD, 12);
  const defaultPasswordHash = await hash("Password123!", 12);

  const admin = await upsertUser({
    firstName: "Umberto",
    lastName: "Giancola",
    email: ADMIN_EMAIL,
    role: UserRole.ADMIN,
    accessCode: "130251",
    passwordHash: adminPasswordHash
  });

  const instructor = await upsertUser({
    firstName: "Marco",
    lastName: "Rossi",
    email: "istruttore@example.com",
    role: UserRole.INSTRUCTOR,
    accessCode: "886611",
    passwordHash: defaultPasswordHash
  });

  const activeSubscriber = await upsertUser({
    firstName: "Luca",
    lastName: "Bianchi",
    email: "abbonato.attivo@example.com",
    role: UserRole.SUBSCRIBER,
    accessCode: "550011",
    passwordHash: defaultPasswordHash,
    assignedInstructorId: instructor.id
  });

  const inactiveSubscriber = await upsertUser({
    firstName: "Giulia",
    lastName: "Neri",
    email: "abbonato.nonattivo@example.com",
    role: UserRole.SUBSCRIBER,
    accessCode: "440022",
    passwordHash: defaultPasswordHash,
    assignedInstructorId: instructor.id
  });

  await upsertSubscription({
    userId: activeSubscriber.id,
    tier: SubscriptionTier.MONTHLY,
    startsAt: new Date(),
    assignedById: admin.id
  });

  await upsertSubscription({
    userId: inactiveSubscriber.id,
    tier: SubscriptionTier.MONTHLY,
    startsAt: addMonths(new Date(), -2),
    assignedById: admin.id
  });

  await prisma.workoutPlan.upsert({
    where: { userId: instructor.id },
    update: {
      monday: "Upper body",
      wednesday: "Cardio + core",
      friday: "Lower body"
    },
    create: {
      userId: instructor.id,
      monday: "Upper body",
      wednesday: "Cardio + core",
      friday: "Lower body"
    }
  });

  await prisma.workoutPlan.upsert({
    where: { userId: activeSubscriber.id },
    update: {
      monday: "Gambe",
      wednesday: "Petto",
      friday: "Schiena"
    },
    create: {
      userId: activeSubscriber.id,
      monday: "Gambe",
      wednesday: "Petto",
      friday: "Schiena"
    }
  });

  console.log("Seed completato con admin e utenti demo.");
}

main()
  .catch((error) => {
    console.error("Errore durante il seed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
