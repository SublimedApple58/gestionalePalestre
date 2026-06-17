import { db, UserRole } from "@gestionale/db";

import { MemberSchedeList } from "@/components/dashboard/member-schede-list";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { requireRole } from "@/lib/session";
import { listTemplatesForUser } from "@/lib/services/workout-template-service";

export const dynamic = "force-dynamic";

export default async function SchedePage() {
  const user = await requireRole([UserRole.SUBSCRIBER]);

  const schede = (await listTemplatesForUser(db, user.id)).filter((s) => s.isAssignedToMe);

  return (
    <AuthenticatedShell
      currentPath="/schede"
      user={{ firstName: user.name.split(" ")[0] ?? user.name, role: user.role }}
    >
      <main className="profile-shell">
        <header className="profile-header">
          <div>
            <p className="eyebrow">Allenamento</p>
            <h1 className="page-title">Le mie schede</h1>
            <p className="subtitle">Le schede di allenamento assegnate dal tuo istruttore.</p>
          </div>
        </header>

        <MemberSchedeList schede={schede} />
      </main>
    </AuthenticatedShell>
  );
}
