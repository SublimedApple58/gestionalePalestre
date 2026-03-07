import { db, UserRole } from "@gestionale/db";
import { redirect } from "next/navigation";

import { PersonalOverview } from "@/components/dashboard/personal-overview";
import { SubscriberDocumentOnboarding } from "@/components/dashboard/subscriber-document-onboarding";
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
    },
    // address è un campo scalare incluso di default
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
        <PersonalOverview
          user={{
            firstName: currentUser.firstName,
            lastName: currentUser.lastName,
            email: currentUser.email,
            phoneNumber: currentUser.phoneNumber,
            address: currentUser.address,
            role: currentUser.role,
            documents: currentUser.documents,
            subscription: currentUser.subscription
          }}
        />

        {currentUser.role === UserRole.SUBSCRIBER ? (
          <SubscriberDocumentOnboarding documents={currentUser.documents} />
        ) : null}
      </main>
    </AuthenticatedShell>
  );
}
