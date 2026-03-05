import { UserRole } from "@gestionale/db";

export type AppNavHref = "/dashboard" | "/utenti" | "/profilo";

export type AppNavItem = {
  href: AppNavHref;
  label: string;
  active: boolean;
};

const BASE_ITEMS: Array<Pick<AppNavItem, "href" | "label">> = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/profilo", label: "Dati personali" }
];

const ADMIN_EXTRA_ITEMS: Array<Pick<AppNavItem, "href" | "label">> = [
  { href: "/utenti", label: "Utenti" }
];

export function getAppNavigationItems(currentPath: string, role?: UserRole): AppNavItem[] {
  const items: Array<Pick<AppNavItem, "href" | "label">> =
    role === UserRole.ADMIN
      ? [BASE_ITEMS[0]!, ...ADMIN_EXTRA_ITEMS, BASE_ITEMS[1]!]
      : [...BASE_ITEMS];

  return items.map((item) => ({
    ...item,
    active: item.href === currentPath
  }));
}
