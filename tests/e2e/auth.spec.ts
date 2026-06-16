import { expect, test } from "@playwright/test";
import { fillWhenHydrated } from "./fill-hydrated";
import { submitCadastroForm } from "./fixtures/submit-form";

const E2E_USER_ID = "22222222-2222-4222-8222-222222222222";

function goTrueUser(id: string, email: string) {
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: "2024-01-15T12:00:00.000Z",
    phone: "",
    confirmed_at: "2024-01-15T12:00:00.000Z",
    last_sign_in_at: "2024-01-15T12:00:00.000Z",
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    is_anonymous: false,
  };
}

/** Corpo JSON bruto de `/signup` no GoTrue quando há sessão (campos no topo — ver `_sessionResponse` no auth-js). */
function signupGoTrueBodyWithSession(userId: string, email: string) {
  const user = goTrueUser(userId, email);
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyMjIyMjIyMi0yMjIyLTQyMjItODIyMi0yMjIyMjIyMjIyMiJ9.e2e",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: "e2e-refresh-token",
    user,
  };
}

test.describe("Cadastro (sign-up) — validação client-side e e-mail duplicado (mock)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/cadastro");
    await expect(page.getByRole("heading", { name: /Crie sua conta/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("cadastro-form")).toBeVisible({ timeout: 20_000 });
  });

  test("e-mail com formato inválido", async ({ page }) => {
    const form = page.getByTestId("cadastro-form");
    await fillWhenHydrated(form.locator("#email"), "nao-e-um-email");
    await fillWhenHydrated(form.locator("#password"), "senha123");
    await submitCadastroForm(page);
    await expect(page.getByTestId("cadastro-error")).toContainText(/e-mail válido/i, { timeout: 15_000 });
  });

  test("senha fraca (< 6 caracteres)", async ({ page }) => {
    const form = page.getByTestId("cadastro-form");
    await fillWhenHydrated(form.locator("#email"), "user@example.com");
    await fillWhenHydrated(form.locator("#password"), "12345");
    await submitCadastroForm(page);
    await expect(page.getByTestId("cadastro-error")).toContainText(/pelo menos 6 caracteres/i, { timeout: 15_000 });
  });

  test("sign-up com sessão imediata (auto-confirm) chama checkout e segue URL devolvida (mocks)", async ({
    page,
  }) => {
    const email = "auto-confirm-e2e@example.com";
    const mockCheckoutTarget = new URL(
      "/e2e-mock/checkout-return",
      process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    ).href;

    await page.route("**/auth/v1/signup**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(signupGoTrueBodyWithSession(E2E_USER_ID, email)),
      });
    });

    await page.route("**/api/checkout/create-session**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: mockCheckoutTarget }),
      });
    });

    const form = page.getByTestId("cadastro-form");
    await fillWhenHydrated(form.locator("#email"), email);
    await fillWhenHydrated(form.locator("#password"), "senha123");
    await submitCadastroForm(page);
    await page.waitForURL("**/e2e-mock/checkout-return**", { timeout: 25_000 });
  });

  test("sign-up sem sessão (GoTrue ainda sem session) manda para /login com carry em next", async ({
    page,
  }) => {
    await page.route("**/auth/v1/signup**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: goTrueUser(E2E_USER_ID, "legacy-null-session@example.com"),
        }),
      });
    });

    const form = page.getByTestId("cadastro-form");
    await fillWhenHydrated(form.locator("#email"), "legacy-null-session@example.com");
    await fillWhenHydrated(form.locator("#password"), "senha123");
    await submitCadastroForm(page);
    await page.waitForURL(/\/login\?/, { timeout: 20_000 });
    const u = new URL(page.url());
    expect(u.searchParams.get("signup")).toBe("1");
    const nextRaw = u.searchParams.get("next");
    expect(nextRaw).toBeTruthy();
    expect(decodeURIComponent(nextRaw ?? "")).toMatch(/^\/assinar\?/);
    await expect(page.getByText(/Enviamos um e-mail de confirmação/i)).toBeVisible();
  });

  test("erro de e-mail já cadastrado (resposta Supabase simulada)", async ({ page }) => {
    await page.route("**/auth/v1/signup**", async (route) => {
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          code: 422,
          error_code: "user_already_exists",
          msg: "User already registered",
        }),
      });
    });

    const form = page.getByTestId("cadastro-form");
    await fillWhenHydrated(form.locator("#email"), "existente@example.com");
    await fillWhenHydrated(form.locator("#password"), "senha123");
    await submitCadastroForm(page);
    await expect(page.getByTestId("cadastro-error")).toContainText(
      /User already registered|already|registered|já|cadastrad/i,
      { timeout: 15_000 },
    );
  });
});
