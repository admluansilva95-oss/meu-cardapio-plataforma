import { expect, test } from "@playwright/test";
import { buildAdminUrlWithCheckoutBypass } from "./fixtures/admin-url";
import { loginWithE2eUser } from "./fixtures/e2e-auth-login";
import { requireE2eAuthCredentials } from "./fixtures/require-e2e-auth";

test.describe("Dashboard /admin", () => {
  test.describe("Integração", () => {
    test.describe.configure({ timeout: 90_000 });

    test.beforeAll(() => {
      requireE2eAuthCredentials();
    });

    test.beforeEach(async ({ page }) => {
      await loginWithE2eUser(page);
      await page.goto(buildAdminUrlWithCheckoutBypass());
      await expect(page.getByRole("heading", { name: /Painel de operações/i })).toBeVisible({ timeout: 25_000 });
    });

    test("esteira: vazio (sem pedidos) ou colunas visíveis", async ({ page }) => {
      const tranquilo = page.getByRole("heading", { name: /Tudo tranquilo por aqui/i });
      const pendente = page.getByText("Pendente").first();
      await expect(tranquilo.or(pendente)).toBeVisible({ timeout: 20_000 });
    });

    test("navegação entre abas principais (sidebar)", async ({ page }) => {
      await page.getByRole("button", { name: /Cardápio/i }).first().click();
      await expect(page.getByRole("heading", { name: /Cardápio na vitrine/i })).toBeVisible();
      await page.getByRole("button", { name: /Pratos/i }).first().click();
      await expect(page.getByRole("heading", { name: /^Pratos$/ })).toBeVisible();
      await page.getByRole("button", { name: /Painel de configuração/i }).first().click();
      await expect(page.getByRole("heading", { name: /Painel de configuração/i })).toBeVisible();
    });

    test("responsividade básica (viewport mobile)", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByRole("heading", { name: /Painel de operações/i })).toBeVisible();
      await expect(page.locator("nav").first()).toBeVisible();
    });
  });
});
