import { UserRole } from "@gestionale/db";

export type AppNavHref = "/dashboard" | "/utenti" | "/profilo" | "/checkout";

export type AppNavItem = {
  href: AppNavHref;
  label: string;
  active: boolean;
};

const DASHBOARD_ITEM: Pick<AppNavItem, "href" | "label"> = { href: "/dashboard", label: "Dashboard" };
const PROFILE_ITEM: Pick<AppNavItem, "href" | "label"> = { href: "/profilo", label: "Dati personali" };
const USERS_ITEM: Pick<AppNavItem, "href" | "label"> = { href: "/utenti", label: "Utenti" };
const CHECKOUT_ITEM: Pick<AppNavItem, "href" | "label"> = { href: "/checkout", label: "Abbonamento" };

export function getAppNavigationItems(currentPath: string, role?: UserRole): AppNavItem[] {
  let items: Array<Pick<AppNavItem, "href" | "label">>;

  if (role === UserRole.ADMIN) {
    items = [DASHBOARD_ITEM, USERS_ITEM, PROFILE_ITEM];
  } else if (role === UserRole.SUBSCRIBER) {
    items = [DASHBOARD_ITEM, CHECKOUT_ITEM, PROFILE_ITEM];
  } else {
    items = [DASHBOARD_ITEM, PROFILE_ITEM];
  }

  return items.map((item) => ({
    ...item,
    active: item.href === currentPath
  }));
}
