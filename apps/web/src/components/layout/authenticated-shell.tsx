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

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-top">
          <p className="eyebrow">Gestionale Palestre</p>
          <h2 className="sidebar-title">Pannello</h2>
          <p className="sidebar-subtitle">{`Ciao ${user.firstName} - ${roleLabel(user.role)}`}</p>
        </div>

        <nav className="sidebar-nav" aria-label="Navigazione principale">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${item.active ? "active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <LogoutButton />
        </div>
      </aside>

      <div className="app-content">{children}</div>
    </div>
  );
}
