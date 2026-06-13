import { expect, test } from "@playwright/test";
import { e2eRestaurantQuery, hasE2eAuthCredentials } from "./fixtures/env";

test.describe("Dashboard /admin", () => {
  test.describe("Integração", () => {
    test.skip(!hasE2eAuthCredentials(), "Defina E2E_EMAIL, E2E_PASSWORD e E2E_RESTAURANT_SLUG");

    test.beforeEach(async ({ page }, testInfo) => {
      const email = process.env.E2E_EMAIL!.trim();
      const password = process.env.E2E_PASSWORD!;
      const q = e2eRestaurantQuery();
      await page.goto("/login");
      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.getByRole("button", { name: /Entrar|Continuar para assinatura/i }).click();
      await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
      if (page.url().includes("/cadastro")) {
        testInfo.skip(true, "Conta sem assinatura ativa: middleware redireciona para /cadastro.");
      }
      await page.goto(`/admin${q}`);
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
