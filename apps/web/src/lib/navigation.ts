export type AppNavItem = {
  href: "/dashboard" | "/profilo";
  label: string;
  active: boolean;
};

const BASE_ITEMS: Array<Pick<AppNavItem, "href" | "label">> = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/profilo", label: "Dati personali" }
];

export function getAppNavigationItems(currentPath: string): AppNavItem[] {
  return BASE_ITEMS.map((item) => ({
    ...item,
    active: item.href === currentPath
  }));
}
