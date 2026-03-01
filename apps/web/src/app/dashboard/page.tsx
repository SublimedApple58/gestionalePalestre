import { db, UserRole } from "@gestionale/db";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/logout-button";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { InstructorDashboard } from "@/components/dashboard/instructor-dashboard";
import { SubscriberDashboard } from "@/components/dashboard/subscriber-dashboard";
import { roleLabel } from "@/lib/roles";
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
  "utente-non-valido": "Dati utente non validi.",
  "ruolo-non-valido": "Ruolo selezionato non valido.",
  "utente-non-trovato": "Utente non trovato.",
  "abbonamento-non-valido": "Dati abbonamento non validi.",
  "assegnazione-non-valida": "Assegnazione istruttore non valida."
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
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Gestionale Palestre</p>
          <h1>{`Ciao ${currentUser.firstName}`}</h1>
          <p className="subtitle">{`Ruolo: ${roleLabel(currentUser.role)}`}</p>
        </div>
        <LogoutButton />
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
        <SubscriberDashboard
          accessCode={currentUser.accessCode}
          assignedInstructor={currentUser.assignedInstructor}
          subscription={currentUser.subscription}
          workoutPlan={currentUser.workoutPlan}
        />
      ) : null}
    </main>
  );
}

type AdminViewProps = {
  currentUserId: string;
  accessCode: string;
};

async function AdminView({ currentUserId, accessCode }: AdminViewProps) {
  const [users, accessLogs] = await Promise.all([
    db.user.findMany({
      include: {
        subscription: true,
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
    })
  ]);

  return <AdminDashboard currentUser={{ id: currentUserId, accessCode }} users={users} accessLogs={accessLogs} />;
}
