import { execSync } from "node:child_process";
import path from "node:path";

import {
  DocumentType,
  DocumentSide,
  DocumentStatus,
  AccessEventType,
  PrismaClient,
  SubscriptionTier,
  UserRole
} from "@gestionale/db";

import {
  ensureSubscriberCanEnter,
  recordEntrySimulation
} from "@/lib/services/access-event-service";
import {
  assignInstructorByAdmin,
  assignSubscriptionByAdmin,
  deleteUserByAdmin
} from "@/lib/services/user-service";

function hasRealConnectionString(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return !value.includes("YOUR-") && !value.includes("DB_NAME_TEST");
}

const hasTestDb = hasRealConnectionString(process.env.DATABASE_URL_TEST) &&
  hasRealConnectionString(process.env.DIRECT_URL_TEST);
const describeIfDb = hasTestDb ? describe : describe.skip;

describeIfDb("RBAC backend e2e", () => {
  const repositoryRoot = path.resolve(__dirname, "../../../../");
  let prisma: PrismaClient;

  async function resetDatabase() {
    await prisma.account.deleteMany();
    await prisma.session.deleteMany();
    await prisma.accessEvent.deleteMany();
    await prisma.userSubscription.deleteMany();
    await prisma.workoutPlan.deleteMany();
    await prisma.user.deleteMany();
  }

  beforeAll(async () => {
    const testDbUrl = process.env.DATABASE_URL_TEST;
    const testDirectUrl = process.env.DIRECT_URL_TEST;

    if (!testDbUrl || !testDirectUrl) {
      return;
    }

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: testDbUrl
        }
      }
    });

    execSync("pnpm --filter @gestionale/db db:push", {
      cwd: repositoryRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: testDbUrl,
        DIRECT_URL: testDirectUrl
      }
    });

    await prisma.$connect();
  });

  beforeEach(async () => {
    if (!prisma) {
      return;
    }

    await resetDatabase();
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }

    await resetDatabase();
    await prisma.$disconnect();
  });

  it("assegna abbonamento e istruttore a un abbonato", async () => {
    const admin = await prisma.user.create({
      data: {
        firstName: "Admin",
        lastName: "One",
        email: "admin@test.local",
        passwordHash: "hash",
        role: UserRole.ADMIN,
        accessCode: "123456"
      }
    });

    const instructor = await prisma.user.create({
      data: {
        firstName: "Coach",
        lastName: "Alpha",
        email: "coach@test.local",
        passwordHash: "hash",
        role: UserRole.INSTRUCTOR,
        accessCode: "654321"
      }
    });

    const subscriber = await prisma.user.create({
      data: {
        firstName: "Sub",
        lastName: "User",
        email: "subscriber@test.local",
        passwordHash: "hash",
        role: UserRole.SUBSCRIBER,
        accessCode: "112233"
      }
    });

    await assignSubscriptionByAdmin(prisma, UserRole.ADMIN, admin.id, {
      targetUserId: subscriber.id,
      tier: SubscriptionTier.MONTHLY,
      startsAt: new Date("2026-03-01T00:00:00.000Z")
    });

    await assignInstructorByAdmin(prisma, UserRole.ADMIN, {
      subscriberId: subscriber.id,
      instructorId: instructor.id
    });

    const updatedSubscriber = await prisma.user.findUniqueOrThrow({
      where: { id: subscriber.id },
      include: { subscription: true }
    });

    expect(updatedSubscriber.assignedInstructorId).toBe(instructor.id);
    expect(updatedSubscriber.subscription?.tier).toBe(SubscriptionTier.MONTHLY);
    expect(updatedSubscriber.subscription?.endsAt.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });

  it("registra ingresso mock solo con abbonamento attivo", async () => {
    const subscriber = await prisma.user.create({
      data: {
        firstName: "Sub",
        lastName: "Active",
        email: "active@test.local",
        passwordHash: "hash",
        role: UserRole.SUBSCRIBER,
        accessCode: "889977",
        subscription: {
          create: {
            tier: SubscriptionTier.MONTHLY,
            startsAt: new Date("2026-02-01T00:00:00.000Z"),
            endsAt: new Date("2026-04-01T00:00:00.000Z")
          }
        }
      }
    });

    await prisma.userDocument.createMany({
      data: [
        {
          userId: subscriber.id,
          type: DocumentType.TAX_CODE,
          side: DocumentSide.FRONT,
          status: DocumentStatus.APPROVED,
          fileName: "cf_subscriber_front.pdf",
          fileLabel: "cf_subscriber_front.pdf",
          storageKey: "tests/cf_subscriber_front.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
          sha256: "1111111111111111111111111111111111111111111111111111111111111111",
          uploadedById: subscriber.id,
          extractedTaxCode: "RSSMRA80A01H501U"
        },
        {
          userId: subscriber.id,
          type: DocumentType.TAX_CODE,
          side: DocumentSide.BACK,
          status: DocumentStatus.APPROVED,
          fileName: "cf_subscriber_back.pdf",
          fileLabel: "cf_subscriber_back.pdf",
          storageKey: "tests/cf_subscriber_back.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
          sha256: "2222222222222222222222222222222222222222222222222222222222222222",
          uploadedById: subscriber.id,
          extractedTaxCode: "RSSMRA80A01H501U"
        },
        {
          userId: subscriber.id,
          type: DocumentType.IDENTITY_DOCUMENT,
          side: DocumentSide.FRONT,
          status: DocumentStatus.APPROVED,
          fileName: "id_subscriber_front.pdf",
          fileLabel: "id_subscriber_front.pdf",
          storageKey: "tests/id_subscriber_front.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
          sha256: "3333333333333333333333333333333333333333333333333333333333333333",
          uploadedById: subscriber.id,
          extractedIdentityNumber: "CA1234567"
        },
        {
          userId: subscriber.id,
          type: DocumentType.IDENTITY_DOCUMENT,
          side: DocumentSide.BACK,
          status: DocumentStatus.APPROVED,
          fileName: "id_subscriber_back.pdf",
          fileLabel: "id_subscriber_back.pdf",
          storageKey: "tests/id_subscriber_back.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
          sha256: "4444444444444444444444444444444444444444444444444444444444444444",
          uploadedById: subscriber.id,
          extractedIdentityNumber: "CA1234567"
        },
        {
          userId: subscriber.id,
          type: DocumentType.MEDICAL_CERTIFICATE,
          side: DocumentSide.SINGLE,
          status: DocumentStatus.APPROVED,
          fileName: "medical_subscriber.pdf",
          fileLabel: "medical_subscriber.pdf",
          storageKey: "tests/medical_subscriber.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
          sha256: "5555555555555555555555555555555555555555555555555555555555555555",
          uploadedById: subscriber.id,
          medicalCertificateExpiresAt: new Date("2026-12-31T00:00:00.000Z")
        }
      ]
    });

    await ensureSubscriberCanEnter(prisma, subscriber.id, new Date("2026-03-15T10:00:00.000Z"));
    await recordEntrySimulation(prisma, subscriber.id);

    const latestAccess = await prisma.accessEvent.findFirst({
      where: { userId: subscriber.id },
      orderBy: { occurredAt: "desc" }
    });

    expect(latestAccess?.eventType).toBe(AccessEventType.ENTRY_SIMULATION);
  });

  it("impedisce l'eliminazione dell'ultimo admin", async () => {
    const admin = await prisma.user.create({
      data: {
        firstName: "Solo",
        lastName: "Admin",
        email: "solo-admin@test.local",
        passwordHash: "hash",
        role: UserRole.ADMIN,
        accessCode: "101010"
      }
    });

    await expect(
      deleteUserByAdmin(prisma, UserRole.ADMIN, {
        targetUserId: admin.id
      })
    ).rejects.toMatchObject({ code: "LAST_ADMIN" });
  });

  it("blocca ingresso iscritto senza documenti obbligatori", async () => {
    const subscriber = await prisma.user.create({
      data: {
        firstName: "No",
        lastName: "Docs",
        email: "no-docs@test.local",
        passwordHash: "hash",
        role: UserRole.SUBSCRIBER,
        accessCode: "909090",
        subscription: {
          create: {
            tier: SubscriptionTier.MONTHLY,
            startsAt: new Date("2026-02-01T00:00:00.000Z"),
            endsAt: new Date("2026-04-01T00:00:00.000Z")
          }
        }
      }
    });

    await expect(
      ensureSubscriberCanEnter(prisma, subscriber.id, new Date("2026-03-15T10:00:00.000Z"))
    ).rejects.toMatchObject({ code: "MISSING_REQUIRED_DOCUMENTS" });
  });
});
