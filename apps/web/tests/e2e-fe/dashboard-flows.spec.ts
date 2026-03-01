import { expect, test, type Page } from "@playwright/test";

function hasRealConnectionString(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return !value.includes("YOUR-") && !value.includes("DB_NAME_TEST");
}

const hasTestDb = hasRealConnectionString(process.env.DATABASE_URL_TEST) &&
  hasRealConnectionString(process.env.DIRECT_URL_TEST);

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Entra nel gestionale" }).click();
}

test.describe("dashboard role-based", () => {
  test.skip(!hasTestDb, "DATABASE_URL_TEST e DIRECT_URL_TEST non configurati");

  test("admin accede e vede pannello gestione utenti", async ({ page }) => {
    await login(page, "umberto.giancola00@gmail.com", "Castiglione1!");

    await expect(page.getByText("Ruolo: Admin")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Controllo porta palestra" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Lista utenti" })).toBeVisible();
    await expect(page.locator("form.inline-form select[name='role']")).toHaveCount(0);
    await expect(page.locator("form.inline-form .custom-select-button").first()).toBeVisible();
  });

  test("abbonato attivo vede il codice nascosto e puo' mostrarlo", async ({ page }) => {
    await login(page, "abbonato.attivo@example.com", "Password123!");

    await expect(page.getByText("Stato: Attivo")).toBeVisible();
    await expect(page.getByText("******")).toBeVisible();

    await page.getByRole("button", { name: "Mostra codice" }).click();
    await expect(page.getByText("550011")).toBeVisible();
  });

  test("abbonato non attivo non vede codice ingresso", async ({ page }) => {
    await login(page, "abbonato.nonattivo@example.com", "Password123!");

    await expect(page.getByText("Codice non disponibile")).toBeVisible();
    await expect(page.getByText("Il codice di accesso viene mostrato solo con abbonamento attivo.")).toBeVisible();
  });

  test("iscritto attivo senza documenti viene bloccato", async ({ page }) => {
    await login(page, "iscritto.docsmancanti@example.com", "Password123!");

    await expect(page.getByText("Codice non disponibile")).toBeVisible();
    await expect(page.getByText("Accesso bloccato: mancano codice fiscale, documento identita', certificato medico.")).toBeVisible();
  });
});
