"use client";

import Link from "next/link";
import { useState } from "react";
import { LayoutDashboard, LogOut, User, Users } from "lucide-react";
import {
  AppShell,
  Burger,
  Group,
  NavLink,
  Text,
  UnstyledButton
} from "@mantine/core";
import { type UserRole } from "@gestionale/db";

import { logoutAction } from "@/app/actions/auth-actions";
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
  "/dashboard": <LayoutDashboard size={20} />,
  "/utenti": <Users size={20} />,
  "/profilo": <User size={20} />
};

const BOTTOM_NAV_ICONS: Record<string, React.ReactNode> = {
  "/dashboard": <LayoutDashboard size={22} />,
  "/utenti": <Users size={22} />,
  "/profilo": <User size={22} />
};

export function AuthenticatedShell({ children, currentPath, user }: AuthenticatedShellProps) {
  const [mobileOpened, setMobileOpened] = useState(false);
  const navItems = getAppNavigationItems(currentPath, user.role);

  return (
    <AppShell
      header={{ height: 56, collapsed: false }}
      navbar={{
        width: 288,
        breakpoint: "md",
        collapsed: { mobile: !mobileOpened, desktop: false }
      }}
      footer={{ height: 64 }}
      padding={0}
    >
      {/* ── Mobile header ────────────────────────────────── */}
      <AppShell.Header hiddenFrom="md" className="app-mobile-header">
        <Group h="100%" px="md" justify="space-between">
          <Group gap={10}>
            <Burger
              opened={mobileOpened}
              onClick={() => setMobileOpened((o) => !o)}
              size="sm"
              color="white"
              aria-label="Toggle navigazione"
            />
            <Group gap={10}>
              <span className="sidebar-brand-mark" aria-hidden="true" style={{ width: 32, height: 32, fontSize: 11 }}>
                GP
              </span>
              <Text fw={800} size="sm" lts="0.06em" c="white">
                HOUSE OF MUSCLE
              </Text>
            </Group>
          </Group>
          <form action={logoutAction}>
            <UnstyledButton
              type="submit"
              aria-label="Esci"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 6,
                borderRadius: 8,
                color: "var(--text-muted)",
                transition: "color 0.15s, background 0.15s"
              }}
            >
              <LogOut size={20} />
            </UnstyledButton>
          </form>
        </Group>
      </AppShell.Header>

      {/* ── Desktop sidebar ──────────────────────────────── */}
      <AppShell.Navbar className="app-mantine-sidebar">
        {/* Brand */}
        <AppShell.Section p="md" pt="lg">
          <Group gap={10} align="center">
            <span className="sidebar-brand-mark" aria-hidden="true">GP</span>
            <div>
              <Text
                size="xs"
                tt="uppercase"
                lts="0.12em"
                fw={700}
                c="#f0939a"
              >
                Gestionale Palestre
              </Text>
              <Text fw={800} size="lg" lts="0.035em" lh={1.2} c="white">
                HOUSE OF MUSCLE
              </Text>
            </div>
          </Group>
        </AppShell.Section>

        {/* Navigation */}
        <AppShell.Section grow p="sm" component="nav" aria-label="Navigazione principale">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              component={Link}
              href={item.href}
              label={item.label}
              leftSection={NAV_ICONS[item.href]}
              active={item.active}
              onClick={() => setMobileOpened(false)}
              className="sidebar-navlink"
              styles={{
                root: {
                  borderRadius: "var(--radius-md)",
                  marginBottom: 6,
                  padding: "11px 13px",
                  fontWeight: 600,
                  fontSize: 14,
                  color: "var(--text-soft)",
                  border: "1px solid var(--border-quiet)",
                  background: "rgba(255,255,255,0.035)",
                  transition: "all 150ms ease",
                  "&:hover": {
                    borderColor: "rgba(223,37,49,0.55)",
                    background: "rgba(223,37,49,0.12)",
                    color: "white",
                    transform: "translateX(2px)"
                  },
                  "&[data-active]": {
                    borderColor: "rgba(223,37,49,0.7)",
                    background: "rgba(223,37,49,0.22)",
                    color: "white",
                    boxShadow: "inset 3px 0 0 rgba(255,255,255,0.25)",
                    "&:hover": {
                      background: "rgba(223,37,49,0.28)"
                    }
                  }
                },
                label: {
                  fontWeight: 600
                },
                section: {
                  opacity: 0.7,
                  "&[data-position='left']": {
                    marginRight: 10
                  }
                }
              }}
            />
          ))}
        </AppShell.Section>

        {/* Footer */}
        <AppShell.Section p="md" style={{ borderTop: "1px solid rgba(255,255,255,0.09)" }}>
          <Text size="xs" tt="uppercase" lts="0.08em" c="dimmed" mb={8}>
            Sessione attiva · {user.firstName}
          </Text>
          <form action={logoutAction} style={{ width: "100%" }}>
            <UnstyledButton
              type="submit"
              className="button button-ghost"
              style={{ width: "100%", justifyContent: "center" }}
            >
              Esci
            </UnstyledButton>
          </form>
        </AppShell.Section>
      </AppShell.Navbar>

      {/* ── Main content ─────────────────────────────────── */}
      <AppShell.Main>
        {children}
      </AppShell.Main>

      {/* ── Mobile bottom nav ────────────────────────────── */}
      <AppShell.Footer hiddenFrom="md" className="app-bottom-nav">
        <nav
          style={{
            display: "flex",
            alignItems: "stretch",
            height: "100%",
            padding: "0 8px"
          }}
          aria-label="Navigazione principale"
        >
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
      </AppShell.Footer>
    </AppShell>
  );
}
