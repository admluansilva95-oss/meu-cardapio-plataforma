import { expect, test } from "@playwright/test";
import { fillWhenHydrated } from "./fill-hydrated";
import { submitCadastroForm } from "./fixtures/submit-form";

/** Garante que validações do React corram (senão `required` / `type=email` / `minLength` bloqueiam o submit). */
async function allowClientValidationOnly(page: import("@playwright/test").Page) {
  const form = page.getByTestId("cadastro-form");
  await form.waitFor({ state: "visible", timeout: 20_000 });
  await form.evaluate((el: HTMLFormElement) => {
    el.noValidate = true;
  });
  await page.locator("#password").waitFor({ state: "visible", timeout: 10_000 });
  await page.locator("#password").evaluate((el: HTMLInputElement) => {
    el.removeAttribute("minlength");
  });
}

test.describe("Cadastro (sign-up) — validação client-side e e-mail duplicado (mock)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/cadastro");
    await expect(page.getByRole("heading", { name: /Crie sua conta/i })).toBeVisible({ timeout: 20_000 });
    await allowClientValidationOnly(page);
  });

  test("slug inválido (curto demais) mostra mensagem", async ({ page }) => {
    const form = page.getByTestId("cadastro-form");
    await fillWhenHydrated(form.locator("#slug"), "ab");
    await fillWhenHydrated(form.locator("#email"), "valid@example.com");
    await fillWhenHydrated(form.locator("#password"), "senha123");
    await submitCadastroForm(page);
    await expect(page.getByTestId("cadastro-error")).toContainText(/Endereço do cardápio inválido/i, {
      timeout: 15_000,
    });
  });

  test("e-mail com formato inválido", async ({ page }) => {
    const form = page.getByTestId("cadastro-form");
    await fillWhenHydrated(form.locator("#slug"), "meu-restaurante-e2e");
    await fillWhenHydrated(form.locator("#email"), "nao-e-um-email");
    await fillWhenHydrated(form.locator("#password"), "senha123");
    await submitCadastroForm(page);
    await expect(page.getByTestId("cadastro-error")).toContainText(/e-mail válido/i, { timeout: 15_000 });
  });

  test("senha fraca (< 6 caracteres)", async ({ page }) => {
    const form = page.getByTestId("cadastro-form");
    await fillWhenHydrated(form.locator("#slug"), "meu-restaurante-e2e");
    await fillWhenHydrated(form.locator("#email"), "user@example.com");
    await fillWhenHydrated(form.locator("#password"), "12345");
    await submitCadastroForm(page);
    await expect(page.getByTestId("cadastro-error")).toContainText(/pelo menos 6 caracteres/i, { timeout: 15_000 });
  });

  test("sign-up com confirmação de e-mail (sessão nula) redireciona para /login?signup=1", async ({ page }) => {
    await page.route("**/auth/v1/signup**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: "22222222-2222-4222-8222-222222222222",
            aud: "authenticated",
            role: "authenticated",
            email: "confirm-flow-e2e@example.com",
            email_confirmed_at: null,
            phone: "",
            confirmed_at: null,
            last_sign_in_at: null,
            app_metadata: {},
            user_metadata: {},
            identities: [],
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
            is_anonymous: false,
          },
          session: null,
        }),
      });
    });

    const form = page.getByTestId("cadastro-form");
    await fillWhenHydrated(form.locator("#slug"), "rest-e2e-confirm-flow");
    await fillWhenHydrated(form.locator("#email"), "confirm-flow-e2e@example.com");
    await fillWhenHydrated(form.locator("#password"), "senha123");
    await submitCadastroForm(page);
    await page.waitForURL(/\/login\?.*signup=1/, { timeout: 20_000 });
    const u = new URL(page.url());
    expect(u.searchParams.get("signup")).toBe("1");
    await expect(page.getByText(/Conta criada\. Confirme o e-mail/i)).toBeVisible();
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
    await fillWhenHydrated(form.locator("#slug"), "slug-novo-e2e");
    await fillWhenHydrated(form.locator("#email"), "existente@example.com");
    await fillWhenHydrated(form.locator("#password"), "senha123");
    await submitCadastroForm(page);
    await expect(page.getByTestId("cadastro-error")).toContainText(
      /User already registered|already|registered|já|cadastrad/i,
      { timeout: 15_000 },
    );
  });
});
