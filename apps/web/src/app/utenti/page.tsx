import { db, UserRole } from "@gestionale/db";
import { redirect } from "next/navigation";

import { UserManagement } from "@/components/dashboard/user-management";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const ERROR_MAP: Record<string, string> = {
  forbidden: "Azione non autorizzata per il tuo ruolo.",
  email_exists: "Email già registrata.",
  last_admin: "Non puoi rimuovere o modificare l'ultimo admin.",
  invalid_role: "Assegnazione non valida per il ruolo selezionato.",
  not_found: "Elemento non trovato.",
  "utente-non-valido": "Dati utente non validi.",
  "ruolo-non-valido": "Ruolo selezionato non valido.",
  "utente-non-trovato": "Utente non trovato.",
  "abbonamento-non-valido": "Dati abbonamento non validi.",
  "assegnazione-non-valida": "Assegnazione istruttore non valida."
};

type UtentiPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function UtentiPage({ searchParams }: UtentiPageProps) {
  const sessionUser = await requireRole([UserRole.ADMIN]);
  const params = await searchParams;

  const [currentUser, users] = await Promise.all([
    db.user.findUnique({
      where: { id: sessionUser.id },
      select: { firstName: true, role: true }
    }),
    db.user.findMany({
      include: {
        subscription: true,
        documents: true,
        assignedInstructor: {
          select: { firstName: true, lastName: true }
        }
      },
      orderBy: [{ role: "asc" }, { lastName: "asc" }]
    })
  ]);

  if (!currentUser) {
    redirect("/login");
  }

  const errorMessage = params.error && ERROR_MAP[params.error]
    ? ERROR_MAP[params.error]
    : null;

  return (
    <AuthenticatedShell
      currentPath="/utenti"
      user={{ firstName: currentUser.firstName, role: currentUser.role }}
    >
      <UserManagement users={users} errorMessage={errorMessage} />
    </AuthenticatedShell>
  );
}
