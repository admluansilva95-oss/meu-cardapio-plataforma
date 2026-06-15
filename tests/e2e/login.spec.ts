import { expect, test } from "@playwright/test";
import { buildAdminUrlWithCheckoutBypass } from "./fixtures/admin-url";
import { loginWithE2eUser } from "./fixtures/e2e-auth-login";
import { requireE2eAuthCredentials } from "./fixtures/require-e2e-auth";
import { waitForAdminPedidosHeading } from "./fixtures/wait-admin-pedidos-heading";
import { fillWhenHydrated } from "./fill-hydrated";
import { countOwnerAuthSessionCookies } from "./fixtures/owner-auth-session-cookies";
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
    test.describe.configure({ mode: "serial", timeout: 90_000 });

    test.beforeAll(() => {
      requireE2eAuthCredentials();
    });

    test("login com sucesso e acesso ao painel", async ({ page }) => {
      await loginWithE2eUser(page);
      const afterLogin = page.url();
      if (afterLogin.includes("/assinar")) {
        await expect(page).toHaveURL(/\/assinar/);
        return;
      }
      await page.goto(buildAdminUrlWithCheckoutBypass());
      await waitForAdminPedidosHeading(page);
    });

    test("persistência: recarregar /admin mantém sessão", async ({ page }) => {
      await loginWithE2eUser(page);
      await page.goto(buildAdminUrlWithCheckoutBypass());
      await waitForAdminPedidosHeading(page);
      await page.reload();
      await waitForAdminPedidosHeading(page, { timeoutMs: 90_000 });
      await expect(page).not.toHaveURL(/\/login(\?|$)/);
      // Sessão do dono usa cookies (`@supabase/ssr` + `auth.storageKey`), não chaves genéricas em localStorage.
      const cookies = await page.context().cookies();
      expect(countOwnerAuthSessionCookies(cookies)).toBeGreaterThan(0);
    });

    test("logout remove sessão e redireciona para login", async ({ page }) => {
      await loginWithE2eUser(page);
      await page.goto(buildAdminUrlWithCheckoutBypass());
      await waitForAdminPedidosHeading(page);

      const cookiesBefore = await page.context().cookies();
      expect(countOwnerAuthSessionCookies(cookiesBefore)).toBeGreaterThan(0);

      await page.getByTestId("admin-sign-out").click();
      await page.waitForURL(/\/login/, { timeout: 15_000 });
      await expect(page).toHaveURL(/\/login/);

      const cookiesAfter = await page.context().cookies();
      expect(countOwnerAuthSessionCookies(cookiesAfter)).toBe(0);
    });
  });
});
