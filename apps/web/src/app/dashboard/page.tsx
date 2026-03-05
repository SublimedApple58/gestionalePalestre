import { db, DocumentStatus, UserRole } from "@gestionale/db";
import { redirect } from "next/navigation";

import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { InstructorDashboard } from "@/components/dashboard/instructor-dashboard";
import { SubscriberDashboard } from "@/components/dashboard/subscriber-dashboard";
import { SubscriberDocumentOnboarding } from "@/components/dashboard/subscriber-document-onboarding";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { roleLabel } from "@/lib/roles";
import { createDocumentDownloadUrl, isDocumentStorageConfigured } from "@/lib/services/document-storage-service";
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
      workoutPlan: true,
      documents: true,
      assignedInstructor: {
        select: {
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

  return (
    <AuthenticatedShell
      currentPath="/dashboard"
      user={{
        firstName: currentUser.firstName,
        role: currentUser.role
      }}
    >
      <main className="dashboard-shell">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Gestionale Palestre</p>
            <h1 className="page-title">{`Ciao ${currentUser.firstName}`}</h1>
            <p className="subtitle">{`Ruolo: ${roleLabel(currentUser.role)}`}</p>
          </div>
        </header>

        {params.error && ERROR_MAP[params.error] ? (
          <p className="error-banner dashboard-error">{ERROR_MAP[params.error]}</p>
        ) : null}

        {currentUser.role === UserRole.ADMIN ? (
          <AdminView currentUserId={currentUser.id} accessCode={currentUser.accessCode} />
        ) : null}

        {currentUser.role === UserRole.INSTRUCTOR ? (
          <InstructorDashboard
            accessCode={currentUser.accessCode}
            assignedSubscribers={currentUser.assignedSubscribers}
            workoutPlan={currentUser.workoutPlan}
          />
        ) : null}

        {currentUser.role === UserRole.SUBSCRIBER ? (
          <>
            <SubscriberDashboard
              accessCode={currentUser.accessCode}
              assignedInstructor={currentUser.assignedInstructor}
              documents={currentUser.documents}
              subscription={currentUser.subscription}
              workoutPlan={currentUser.workoutPlan}
            />

            <SubscriberDocumentOnboarding documents={currentUser.documents} />
          </>
        ) : null}
      </main>
    </AuthenticatedShell>
  );
}

type AdminViewProps = {
  currentUserId: string;
  accessCode: string;
};

async function AdminView({ currentUserId, accessCode }: AdminViewProps) {
  const [users, accessLogs, reviewDocumentsRaw] = await Promise.all([
    db.user.findMany({
      include: {
        subscription: true,
        documents: true,
        assignedInstructor: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: [{ role: "asc" }, { lastName: "asc" }]
    }),
    db.accessEvent.findMany({
      include: {
        user: {
          select: {
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
      where: {
        status: {
          in: [DocumentStatus.PENDING_ADMIN_REVIEW]
        }
      },
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
      orderBy: {
        uploadedAt: "desc"
      },
      take: 80
    })
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

  return (
    <AdminDashboard
      currentUser={{ id: currentUserId, accessCode }}
      users={users}
      accessLogs={accessLogs}
      reviewDocuments={reviewDocuments}
    />
  );
}
