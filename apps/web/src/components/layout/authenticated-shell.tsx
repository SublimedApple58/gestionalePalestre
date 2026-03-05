import Link from "next/link";
import { LayoutDashboard, LogOut, User, Users } from "lucide-react";
import { type UserRole } from "@gestionale/db";

import { logoutAction } from "@/app/actions/auth-actions";
import { LogoutButton } from "@/components/auth/logout-button";
import { getAppNavigationItems } from "@/lib/navigation";

type AuthenticatedShellProps = {
  children: React.ReactNode;
  currentPath: "/dashboard" | "/utenti" | "/profilo";
  user: {
    firstName: string;
    role: UserRole;
  };
};

const NAV_ICONS: Record<string, React.ReactNode> = {
  "/dashboard": <LayoutDashboard size={20} aria-hidden="true" />,
  "/utenti": <Users size={20} aria-hidden="true" />,
  "/profilo": <User size={20} aria-hidden="true" />
};

const BOTTOM_NAV_ICONS: Record<string, React.ReactNode> = {
  "/dashboard": <LayoutDashboard size={22} />,
  "/utenti": <Users size={22} />,
  "/profilo": <User size={22} />
};

export function AuthenticatedShell({ children, currentPath, user }: AuthenticatedShellProps) {
  const navItems = getAppNavigationItems(currentPath, user.role);

  return (
    <div className="app-shell">
      {/* ── Mobile top header ─────────────────────────────────────── */}
      <header className="mobile-header" aria-label="Intestazione app">
        <div className="mobile-header-brand">
          <span className="sidebar-brand-mark" aria-hidden="true">GP</span>
          <span className="mobile-header-title">HOUSE OF MUSCLE</span>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="mobile-header-logout" aria-label="Esci">
            <LogOut size={20} />
          </button>
        </form>
      </header>

      {/* ── Desktop sidebar ───────────────────────────────────────── */}
      <aside className="app-sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <span className="sidebar-brand-mark" aria-hidden="true">GP</span>
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
              <span className="sidebar-link-icon">{NAV_ICONS[item.href]}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <p className="sidebar-footnote">Sessione attiva · {user.firstName}</p>
          <LogoutButton />
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────── */}
      <div className="app-content">{children}</div>

      {/* ── Mobile bottom nav ─────────────────────────────────────── */}
      <nav className="bottom-nav" aria-label="Navigazione principale">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`bottom-nav-link ${item.active ? "active" : ""}`}
            aria-current={item.active ? "page" : undefined}
          >
            {BOTTOM_NAV_ICONS[item.href]}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
