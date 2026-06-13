import { expect, test } from "@playwright/test";
import { fillWhenHydrated } from "./fill-hydrated";
import { e2eRestaurantQuery, hasE2eAuthCredentials } from "./fixtures/env";
import { submitLoginForm } from "./fixtures/submit-form";

test.describe("Login", () => {
  test("credenciais inválidas exibem alerta", async ({ page }) => {
    await page.route(/\/auth\/v1\/token(\?|$)/, async (route) => {
      const url = route.request().url();
      if (!url.includes("grant_type=password")) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "invalid_grant",
          error_description: "Invalid login credentials",
        }),
      });
    });

    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /Entrar com segurança/i })).toBeVisible({ timeout: 20_000 });
    const form = page.getByTestId("login-form");
    await form.waitFor({ state: "visible", timeout: 15_000 });
    await fillWhenHydrated(form.locator("#email"), "definitivamente-nao-existe-e2e@example.com");
    await fillWhenHydrated(form.locator("#password"), "SenhaErrada999!");
    await submitLoginForm(page);
    /** UI usa `mensagemErroSupabaseAuthAmigavel` (PT), não o texto cru em inglês do GoTrue. */
    await expect(page.getByTestId("login-error")).toContainText(/E-mail ou senha incorretos/i, {
      timeout: 25_000,
    });
  });

  test.describe("Integração (Supabase real)", () => {
    test.skip(!hasE2eAuthCredentials(), "Defina E2E_EMAIL, E2E_PASSWORD e E2E_RESTAURANT_SLUG");

    test("login com sucesso e acesso ao painel", async ({ page }, testInfo) => {
      const email = process.env.E2E_EMAIL!.trim();
      const password = process.env.E2E_PASSWORD!;
      const q = e2eRestaurantQuery();

      await page.goto("/login");
      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.getByRole("button", { name: /Entrar|Continuar para assinatura/i }).click();
      await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
      if (page.url().includes("/cadastro")) {
        testInfo.skip(true, "Conta sem assinatura ativa — acedeu a /cadastro. Configure assinatura ou use conta de teste com plano.");
      }
      if (page.url().includes("/assinar")) {
        await expect(page).toHaveURL(/\/assinar/);
        return;
      }
      await page.goto(`/admin${q}`);
      await expect(page.getByRole("heading", { name: /Painel de operações|Cardápio na vitrine|Pratos|Painel de configuração/i })).toBeVisible({
        timeout: 20_000,
      });
    });

    test("persistência: recarregar /admin mantém sessão", async ({ page }, testInfo) => {
      const email = process.env.E2E_EMAIL!.trim();
      const password = process.env.E2E_PASSWORD!;
      const q = e2eRestaurantQuery();

      await page.goto("/login");
      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.getByRole("button", { name: /Entrar|Continuar para assinatura/i }).click();
      await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
      if (page.url().includes("/cadastro")) {
        testInfo.skip(true, "Conta sem assinatura ativa — não é possível validar /admin.");
      }

      await page.goto(`/admin${q}`);
      await page.reload();
      await expect(page).not.toHaveURL(/\/login(\?|$)/);
      const keys = await page.evaluate(() => Object.keys(localStorage));
      expect(keys.some((k) => k.includes("auth") || k.includes("supabase") || k.includes("sb-"))).toBeTruthy();
    });

    test("logout remove sessão e redireciona para login", async ({ page }, testInfo) => {
      const email = process.env.E2E_EMAIL!.trim();
      const password = process.env.E2E_PASSWORD!;
      const q = e2eRestaurantQuery();

      await page.goto("/login");
      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.getByRole("button", { name: /Entrar|Continuar para assinatura/i }).click();
      await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
      if (page.url().includes("/cadastro")) {
        testInfo.skip(true, "Conta sem assinatura ativa — botão Sair só no /admin.");
      }

      await page.goto(`/admin${q}`);
      const authKeysBeforeSignOut = await page.evaluate(() =>
        Object.keys(localStorage).filter((k) => k.startsWith("sb-") || k.toLowerCase().includes("supabase")),
      );
      expect(authKeysBeforeSignOut.length).toBeGreaterThan(0);

      await page.getByTestId("admin-sign-out").click();
      await page.waitForURL(/\/login/, { timeout: 15_000 });
      await expect(page).toHaveURL(/\/login/);

      const authKeysAfterSignOut = await page.evaluate(() =>
        Object.keys(localStorage).filter((k) => k.startsWith("sb-") || k.toLowerCase().includes("supabase")),
      );
      expect(authKeysAfterSignOut.length).toBe(0);
    });
  });
});
