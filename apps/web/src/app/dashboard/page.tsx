import { db, DocumentStatus, DocumentType, InstallmentStatus, UserRole } from "@gestionale/db";
import { redirect } from "next/navigation";

import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { InstructorDashboard } from "@/components/dashboard/instructor-dashboard";
import { SubscriberDashboard } from "@/components/dashboard/subscriber-dashboard";
import { SubscriberDocumentOnboarding } from "@/components/dashboard/subscriber-document-onboarding";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { getProfilePhotoUrl, getProfilePhotoUrls } from "@/lib/profile-photo";
import { roleLabel } from "@/lib/roles";
import { createDocumentDownloadUrl, isDocumentStorageConfigured } from "@/lib/services/document-storage-service";
import { listLowActivitySubscribers } from "@/lib/services/low-activity-service";
import { requireSessionUser } from "@/lib/session";

type DashboardPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

const ERROR_MAP: Record<string, string> = {
  forbidden: "Azione non autorizzata per il tuo ruolo.",
  email_exists: "Email gia' registrata.",
  last_admin: "Non puoi rimuovere o modificare l'ultimo admin.",
  invalid_role: "Assegnazione non valida per il ruolo selezionato.",
  not_found: "Elemento non trovato.",
  subscription_inactive: "Abbonamento non attivo: ingresso non consentito.",
  missing_required_documents: "Accesso bloccato: carica prima i documenti richiesti.",
  "utente-non-valido": "Dati utente non validi.",
  "ruolo-non-valido": "Ruolo selezionato non valido.",
  "utente-non-trovato": "Utente non trovato.",
  "abbonamento-non-valido": "Dati abbonamento non validi.",
  "assegnazione-non-valida": "Assegnazione istruttore non valida.",
  "profilo-non-valido": "Cellulare non valido.",
  "documento-non-valido": "Dati documento non validi.",
  invalid_document_side: "Lato documento non valido.",
  invalid_document_mime: "Formato file documento non supportato.",
  invalid_document_size: "File troppo grande o non valido.",
  invalid_document_hash: "Hash documento non valido.",
  invalid_document_magic_bytes: "File non coerente con il formato dichiarato.",
  invalid_medical_certificate_expiry: "Data scadenza certificato medico non valida.",
  document_rate_limit: "Troppi tentativi in poco tempo. Riprova tra pochi minuti.",
  document_storage_not_configured: "Storage documentale non configurato.",
  invalid_rejection_reason: "Motivazione rifiuto non valida."
};

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const sessionUser = await requireSessionUser();
  const params = await searchParams;

  const currentUser = await db.user.findUnique({
    where: { id: sessionUser.id },
    include: {
      subscription: true,
      entryPackage: true,
      workoutPlan: true,
      documents: true,
      assignedInstructor: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
        }
      },
      assignedSubscribers: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
        },
        orderBy: { lastName: "asc" }
      }
    }
  });

  if (!currentUser) {
    redirect("/login");
  }

  const profilePhotoUrl = await getProfilePhotoUrl(currentUser.id);

  return (
    <AuthenticatedShell
      currentPath="/dashboard"
      user={{
        firstName: currentUser.firstName,
        role: currentUser.role
      }}
    >
      <main className="dashboard-shell">
        <DashboardHero
          firstName={currentUser.firstName}
          lastName={currentUser.lastName}
          role={currentUser.role}
          profilePhotoUrl={profilePhotoUrl}
          subscription={currentUser.subscription}
          entryPackage={currentUser.entryPackage}
        />

        {params.error && ERROR_MAP[params.error] ? (
          <p className="error-banner dashboard-error">{ERROR_MAP[params.error]}</p>
        ) : null}

        {currentUser.role === UserRole.ADMIN ? (
          <AdminView currentUserId={currentUser.id} accessCode={currentUser.accessCode} />
        ) : null}

        {currentUser.role === UserRole.INSTRUCTOR ? (
          <InstructorView
            accessCode={currentUser.accessCode}
            assignedSubscribers={currentUser.assignedSubscribers}
            workoutPlan={currentUser.workoutPlan}
          />
        ) : null}

        {currentUser.role === UserRole.SUBSCRIBER ? (
          <SubscriberView
            accessCode={currentUser.accessCode}
            firstName={currentUser.firstName}
            assignedInstructor={currentUser.assignedInstructor}
            documents={currentUser.documents}
            subscription={currentUser.subscription}
            entryPackage={currentUser.entryPackage}
            workoutPlan={currentUser.workoutPlan}
            isBirthdayToday={isSameMonthDay(currentUser.dateOfBirth, new Date())}
          />
        ) : null}
      </main>
    </AuthenticatedShell>
  );
}

/* ── Subscriber view wrapper — fetches instructor photo ────────────────── */

type SubscriberViewProps = {
  accessCode: string;
  firstName: string;
  assignedInstructor: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  documents: Parameters<typeof SubscriberDashboard>[0]["documents"];
  subscription: Parameters<typeof SubscriberDashboard>[0]["subscription"];
  entryPackage: Parameters<typeof SubscriberDashboard>[0]["entryPackage"];
  workoutPlan: Parameters<typeof SubscriberDashboard>[0]["workoutPlan"];
  isBirthdayToday: boolean;
};

async function SubscriberView({
  accessCode,
  firstName,
  assignedInstructor,
  documents,
  subscription,
  entryPackage,
  workoutPlan,
  isBirthdayToday
}: SubscriberViewProps) {
  const instructorPhotoUrl = assignedInstructor
    ? await getProfilePhotoUrl(assignedInstructor.id)
    : null;

  return (
    <>
      <SubscriberDashboard
        accessCode={accessCode}
        firstName={firstName}
        assignedInstructor={assignedInstructor}
        instructorPhotoUrl={instructorPhotoUrl}
        documents={documents}
        subscription={subscription}
        entryPackage={entryPackage}
        workoutPlan={workoutPlan}
        isBirthdayToday={isBirthdayToday}
      />
      <SubscriberDocumentOnboarding documents={documents} />
    </>
  );
}

function isSameMonthDay(dateOfBirth: Date | null | undefined, reference: Date): boolean {
  if (!dateOfBirth) return false;
  const dob = new Date(dateOfBirth);
  return (
    dob.getUTCMonth() === reference.getUTCMonth() &&
    dob.getUTCDate() === reference.getUTCDate()
  );
}

/* ── Instructor view wrapper — fetches subscriber photos ───────────────── */

type InstructorViewProps = {
  accessCode: string;
  assignedSubscribers: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  }>;
  workoutPlan: Parameters<typeof InstructorDashboard>[0]["workoutPlan"];
};

async function InstructorView({
  accessCode,
  assignedSubscribers,
  workoutPlan
}: InstructorViewProps) {
  const photoUrlMap = await getProfilePhotoUrls(
    assignedSubscribers.map((s) => s.id)
  );

  return (
    <InstructorDashboard
      accessCode={accessCode}
      assignedSubscribers={assignedSubscribers}
      subscriberPhotoUrls={Object.fromEntries(photoUrlMap)}
      workoutPlan={workoutPlan}
    />
  );
}

/* ── Admin view wrapper — fetches pending review data + photos ─────────── */

type AdminViewProps = {
  currentUserId: string;
  accessCode: string;
};

async function AdminView({ currentUserId, accessCode }: AdminViewProps) {
  const associationThreshold = new Date();
  associationThreshold.setDate(associationThreshold.getDate() + 14);
  const certificateThreshold = new Date();
  certificateThreshold.setDate(certificateThreshold.getDate() + 30);
  const [
    accessLogs,
    reviewDocumentsRaw,
    overdueInstallments,
    expiringAssociations,
    expiringCertificatesRaw,
    lowActivitySubscribers
  ] = await Promise.all([
    db.accessEvent.findMany({
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true
          }
        }
      },
      orderBy: { occurredAt: "desc" },
      take: 60
    }),
    db.userDocument.findMany({
      where: { status: { in: [DocumentStatus.PENDING_ADMIN_REVIEW] } },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      },
      orderBy: { uploadedAt: "desc" },
      take: 80
    }),
    db.installment.findMany({
      where: {
        status: { in: [InstallmentStatus.FAILED, InstallmentStatus.SCHEDULED] },
        dueAt: { lte: new Date() },
        plan: { status: "ACTIVE" }
      },
      include: {
        plan: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } }
          }
        }
      },
      orderBy: { dueAt: "asc" },
      take: 50
    }),
    db.user.findMany({
      where: {
        associationMember: true,
        associationExpiresAt: { not: null, lte: associationThreshold }
      },
      select: { id: true, firstName: true, lastName: true, associationExpiresAt: true },
      orderBy: { associationExpiresAt: "asc" },
      take: 100
    }),
    // Certificati medici APPROVATI in scadenza (entro 30 gg) o già scaduti.
    // La scadenza vive sul documento; il certificato è unico per iscritto.
    db.userDocument.findMany({
      where: {
        type: DocumentType.MEDICAL_CERTIFICATE,
        status: DocumentStatus.APPROVED,
        medicalCertificateExpiresAt: { not: null, lte: certificateThreshold },
        user: { role: UserRole.SUBSCRIBER }
      },
      select: {
        medicalCertificateExpiresAt: true,
        user: { select: { id: true, firstName: true, lastName: true } }
      },
      orderBy: { medicalCertificateExpiresAt: "asc" },
      take: 100
    }),
    // Iscritti attivi senza ingressi da ≥15 giorni (banner "da ricontattare")
    listLowActivitySubscribers(db, { days: 15, take: 20 })
  ]);

  const storageConfigured = isDocumentStorageConfigured();
  const reviewDocuments = await Promise.all(
    reviewDocumentsRaw.map(async (document) => ({
      ...document,
      previewUrl: storageConfigured
        ? await createDocumentDownloadUrl({ storageKey: document.storageKey, expiresInSeconds: 300 }).catch(
            () => null
          )
        : null
    }))
  );

  // Fetch profile photos for users in access logs
  const allUserIds = new Set<string>();
  for (const log of accessLogs) allUserIds.add(log.user.id);
  const photoUrlMap = await getProfilePhotoUrls(Array.from(allUserIds));

  return (
    <AdminDashboard
      currentUser={{ id: currentUserId, accessCode }}
      accessLogs={accessLogs}
      reviewDocuments={reviewDocuments}
      profilePhotoUrls={Object.fromEntries(photoUrlMap)}
      overdueInstallments={overdueInstallments}
      expiringAssociations={expiringAssociations.map((u) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        associationExpiresAt: u.associationExpiresAt as Date
      }))}
      expiringCertificates={expiringCertificatesRaw.map((d) => ({
        id: d.user.id,
        firstName: d.user.firstName,
        lastName: d.user.lastName,
        medicalCertificateExpiresAt: d.medicalCertificateExpiresAt as Date
      }))}
      lowActivitySubscribers={lowActivitySubscribers}
    />
  );
}
