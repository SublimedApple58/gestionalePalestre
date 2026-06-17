import { UserRole } from "@gestionale/db";

export type AppNavHref = "/dashboard" | "/utenti" | "/profilo" | "/checkout" | "/schede";

export type AppNavItem = {
  href: AppNavHref;
  label: string;
  /** Etichetta compatta per la bottom nav mobile (colonne strette). */
  shortLabel: string;
  active: boolean;
};

type NavItemDef = Pick<AppNavItem, "href" | "label" | "shortLabel">;

const DASHBOARD_ITEM: NavItemDef = { href: "/dashboard", label: "Dashboard", shortLabel: "Dashboard" };
const PROFILE_ITEM: NavItemDef = { href: "/profilo", label: "Dati personali", shortLabel: "Profilo" };
const USERS_ITEM: NavItemDef = { href: "/utenti", label: "Utenti", shortLabel: "Utenti" };
const CHECKOUT_ITEM: NavItemDef = { href: "/checkout", label: "Abbonamento", shortLabel: "Abbon." };
const SCHEDE_ITEM: NavItemDef = { href: "/schede", label: "Le mie schede", shortLabel: "Schede" };

export function getAppNavigationItems(currentPath: string, role?: UserRole): AppNavItem[] {
  let items: NavItemDef[];

  if (role === UserRole.ADMIN) {
    items = [DASHBOARD_ITEM, USERS_ITEM, PROFILE_ITEM];
  } else if (role === UserRole.SUBSCRIBER) {
    items = [DASHBOARD_ITEM, SCHEDE_ITEM, CHECKOUT_ITEM, PROFILE_ITEM];
  } else {
    items = [DASHBOARD_ITEM, PROFILE_ITEM];
  }

  return items.map((item) => ({
    ...item,
    active: item.href === currentPath
  }));
}
