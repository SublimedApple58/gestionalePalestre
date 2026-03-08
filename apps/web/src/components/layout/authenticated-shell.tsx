"use client";

import Link from "next/link";
import { useState } from "react";
import { LayoutDashboard, LogOut, User, Users } from "lucide-react";
import { Layout, Menu, Button, Drawer, Typography } from "antd";
import { MenuOutlined } from "@ant-design/icons";
import { type UserRole } from "@gestionale/db";

import { logoutAction } from "@/app/actions/auth-actions";
import { getAppNavigationItems } from "@/lib/navigation";

const { Sider, Header, Content, Footer } = Layout;
const { Text } = Typography;

type AuthenticatedShellProps = {
  children: React.ReactNode;
  currentPath: "/dashboard" | "/utenti" | "/profilo";
  user: {
    firstName: string;
    role: UserRole;
  };
};

const NAV_ICONS: Record<string, React.ReactNode> = {
  "/dashboard": <LayoutDashboard size={18} />,
  "/utenti": <Users size={18} />,
  "/profilo": <User size={18} />
};

const BOTTOM_NAV_ICONS: Record<string, React.ReactNode> = {
  "/dashboard": <LayoutDashboard size={22} />,
  "/utenti": <Users size={22} />,
  "/profilo": <User size={22} />
};

export function AuthenticatedShell({ children, currentPath, user }: AuthenticatedShellProps) {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const navItems = getAppNavigationItems(currentPath, user.role);

  const menuItems = navItems.map((item) => ({
    key: item.href,
    icon: NAV_ICONS[item.href],
    label: <Link href={item.href} onClick={() => setMobileDrawerOpen(false)}>{item.label}</Link>
  }));

  const sidebarContent = (
    <>
      {/* Brand */}
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark" aria-hidden="true">GP</span>
        <div>
          <Text className="sidebar-brand-kicker">Gestionale Palestre</Text>
          <Text className="sidebar-brand-title">HOUSE OF MUSCLE</Text>
        </div>
      </div>

      {/* Navigation */}
      <Menu
        mode="inline"
        theme="dark"
        selectedKeys={[currentPath]}
        items={menuItems}
        className="sidebar-menu"
        style={{ background: "transparent", border: "none", flex: 1 }}
      />

      {/* Footer */}
      <div className="sidebar-footer">
        <Text className="sidebar-session-text">
          Sessione attiva · {user.firstName}
        </Text>
        <form action={logoutAction} style={{ width: "100%" }}>
          <button
            type="submit"
            className="button button-ghost"
            style={{ width: "100%", justifyContent: "center" }}
          >
            Esci
          </button>
        </form>
      </div>
    </>
  );

  return (
    <Layout style={{ minHeight: "100vh" }}>
      {/* ── Desktop sidebar ──────────────────────────────── */}
      <Sider
        width={288}
        className="app-sider"
        trigger={null}
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid rgba(223,37,49,0.28)",
          background:
            "radial-gradient(circle at 10% -4%, rgba(223,37,49,0.28), transparent 35%), linear-gradient(180deg, rgba(15,15,22,0.98), rgba(8,8,12,0.98))",
          backdropFilter: "blur(6px)",
          boxShadow: "inset -1px 0 0 rgba(255,255,255,0.05)",
          overflow: "auto"
        }}
      >
        {sidebarContent}
      </Sider>

      {/* ── Mobile header ────────────────────────────────── */}
      <Header className="app-mobile-header">
        <div className="mobile-header-left">
          <Button
            type="text"
            icon={<MenuOutlined style={{ color: "white", fontSize: 18 }} />}
            onClick={() => setMobileDrawerOpen(true)}
            aria-label="Toggle navigazione"
            className="mobile-burger"
          />
          <div className="mobile-header-brand">
            <span className="sidebar-brand-mark sidebar-brand-mark-small" aria-hidden="true">GP</span>
            <Text strong style={{ color: "white", fontSize: 13, letterSpacing: "0.06em" }}>
              HOUSE OF MUSCLE
            </Text>
          </div>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="mobile-logout-btn"
            aria-label="Esci"
          >
            <LogOut size={20} />
          </button>
        </form>
      </Header>

      {/* ── Mobile drawer ────────────────────────────────── */}
      <Drawer
        placement="left"
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        width={288}
        closable={false}
        className="mobile-sidebar-drawer"
        styles={{
          body: {
            padding: 0,
            display: "flex",
            flexDirection: "column",
            background:
              "radial-gradient(circle at 10% -4%, rgba(223,37,49,0.28), transparent 35%), linear-gradient(180deg, rgba(15,15,22,0.98), rgba(8,8,12,0.98))"
          },
          wrapper: {
            boxShadow: "4px 0 24px rgba(0,0,0,0.5)"
          }
        }}
      >
        {sidebarContent}
      </Drawer>

      {/* ── Main content ─────────────────────────────────── */}
      <Layout className="app-content-layout">
        <Content style={{ minHeight: "100vh" }}>
          {children}
        </Content>
      </Layout>

      {/* ── Mobile bottom nav ────────────────────────────── */}
      <Footer className="app-bottom-nav">
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
      </Footer>
    </Layout>
  );
}
