import { getAppNavigationItems } from "@/lib/navigation";

describe("app navigation", () => {
  it("imposta attiva la voce dashboard quando il path e' /dashboard", () => {
    const items = getAppNavigationItems("/dashboard");

    expect(items.find((item) => item.href === "/dashboard")?.active).toBe(true);
    expect(items.find((item) => item.href === "/profilo")?.active).toBe(false);
  });

  it("imposta attiva la voce profilo quando il path e' /profilo", () => {
    const items = getAppNavigationItems("/profilo");

    expect(items.find((item) => item.href === "/profilo")?.active).toBe(true);
    expect(items.find((item) => item.href === "/dashboard")?.active).toBe(false);
  });
});
