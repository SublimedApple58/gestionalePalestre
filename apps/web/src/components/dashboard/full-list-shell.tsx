import { type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { type UserRole } from "@gestionale/db";

import { AuthenticatedShell } from "@/components/layout/authenticated-shell";

/**
 * Shell per le pagine "Vedi tutti" (elenco completo di una card della home admin):
 * stessa cornice autenticata + link "Torna alla home".
 */
export function FullListShell({
  user,
  children
}: {
  user: { firstName: string; role: UserRole };
  children: ReactNode;
}) {
  return (
    <AuthenticatedShell currentPath="/dashboard" user={user}>
      <main className="dashboard-shell">
        <Link href="/dashboard" className="dash-back-link">
          <ArrowLeft size={14} />
          Torna alla home
        </Link>
        {children}
      </main>
    </AuthenticatedShell>
  );
}
