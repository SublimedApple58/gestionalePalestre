import { db } from "@gestionale/db";
import { redirect } from "next/navigation";

import { PersonalOverview } from "@/components/dashboard/personal-overview";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { requireSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const sessionUser = await requireSessionUser();

  const currentUser = await db.user.findUnique({
    where: { id: sessionUser.id },
    include: {
      subscription: true,
      documents: true
    }
  });

  if (!currentUser) {
    redirect("/login");
  }

  return (
    <AuthenticatedShell
      currentPath="/profilo"
      user={{
        firstName: currentUser.firstName,
        role: currentUser.role
      }}
    >
      <main className="profile-shell">
        <header className="profile-header">
          <div>
            <p className="eyebrow">Profilo</p>
            <h1 className="page-title">I tuoi dati personali</h1>
            <p className="subtitle">Pagina dedicata semplice per informazioni, documenti e recapiti.</p>
          </div>
        </header>

        <PersonalOverview
          user={{
            firstName: currentUser.firstName,
            lastName: currentUser.lastName,
            email: currentUser.email,
            phoneNumber: currentUser.phoneNumber,
            role: currentUser.role,
            documents: currentUser.documents,
            subscription: currentUser.subscription
          }}
        />
      </main>
    </AuthenticatedShell>
  );
}
