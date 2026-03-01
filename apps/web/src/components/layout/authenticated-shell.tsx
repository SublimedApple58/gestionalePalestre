import Link from "next/link";

import { LogoutButton } from "@/components/auth/logout-button";
import { getAppNavigationItems } from "@/lib/navigation";
import { roleLabel } from "@/lib/roles";

type AuthenticatedShellProps = {
  children: React.ReactNode;
  currentPath: "/dashboard" | "/profilo";
  user: {
    firstName: string;
    role: Parameters<typeof roleLabel>[0];
  };
};

export function AuthenticatedShell({ children, currentPath, user }: AuthenticatedShellProps) {
  const navItems = getAppNavigationItems(currentPath);
  const currentRoleLabel = roleLabel(user.role);

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
              <h2 className="sidebar-title">Control Room</h2>
            </div>
          </div>

          <p className="sidebar-subtitle">{`Ciao ${user.firstName}`}</p>
          <p className="sidebar-role-pill">{currentRoleLabel}</p>
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
