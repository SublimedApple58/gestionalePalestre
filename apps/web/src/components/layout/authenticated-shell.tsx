import Link from "next/link";
import { type UserRole } from "@gestionale/db";

import { LogoutButton } from "@/components/auth/logout-button";
import { getAppNavigationItems } from "@/lib/navigation";

type AuthenticatedShellProps = {
  children: React.ReactNode;
  currentPath: "/dashboard" | "/profilo";
  user: {
    firstName: string;
    role: UserRole;
  };
};

export function AuthenticatedShell({ children, currentPath }: AuthenticatedShellProps) {
  const navItems = getAppNavigationItems(currentPath);

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <span className="sidebar-brand-mark" aria-hidden="true">
              GP
            </span>

            <div>
              <p className="eyebrow">Gestionale Palestre</p>
              <h2 className="sidebar-title">HOUSE OF MUSCLE</h2>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Navigazione principale">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${item.active ? "active" : ""}`}
            >
              <span className="sidebar-link-dot" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <p className="sidebar-footnote">Sessione attiva</p>
          <LogoutButton />
        </div>
      </aside>

      <div className="app-content">{children}</div>
    </div>
  );
}
