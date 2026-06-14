import { expect, test } from "@playwright/test";
import { submitCadastroForm } from "./fixtures/submit-form";

/**
 * E-mails de confirmação e recuperação são enviados pelo **Supabase Auth** (GoTrue),
 * não por SMTP da aplicação. O cliente só chama `signUp` / `resetPasswordForEmail`.
 *
 * Este teste valida que o **pedido HTTP** ao endpoint de signup é feito com JSON esperado
 * (gatilho do fluxo). Para inspecionar o e-mail real, use Mailpit, Inbucket ou o painel Supabase.
 *
 * **Recuperação de senha:** a UI atual não expõe `resetPasswordForEmail`. Quando existir,
 * adicionar teste com `page.route('** /auth/v1/recover**', …)` (path pode variar com a versão
 * do GoTrue) — ver `tests/e2e/EMAIL_AND_AUTH.md`.
 */
test.describe("Disparo de e-mail (Supabase Auth)", () => {
  test("cadastro chama POST /auth/v1/signup com e-mail no corpo", async ({ page }) => {
    let posted: Record<string, unknown> | null = null;

    await page.route("**/auth/v1/signup**", async (route) => {
      try {
        posted = route.request().postDataJSON() as Record<string, unknown>;
      } catch {
        posted = {};
      }
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          code: 422,
          error_code: "email_address_invalid",
          msg: "e2e_stop",
        }),
      });
    });

    await page.goto("/cadastro");
    await expect(page.getByRole("heading", { name: /Crie sua conta/i })).toBeVisible({ timeout: 20_000 });
    await page.locator("form").first().waitFor({ state: "visible", timeout: 20_000 });
    await page.locator("form").first().evaluate((el: HTMLFormElement) => {
      el.noValidate = true;
    });
    await page.locator("#password").waitFor({ state: "visible", timeout: 10_000 });
    await page.locator("#password").evaluate((el: HTMLInputElement) => {
      el.removeAttribute("minlength");
    });

    await page.locator("#slug").fill("rest-e2e-email");
    await page.locator("#email").fill("trigger-signup@example.com");
    await page.locator("#password").fill("senha123");
    await submitCadastroForm(page);

    await expect.poll(() => posted?.email).toBe("trigger-signup@example.com");
    await expect(page.getByTestId("cadastro-error")).toBeVisible();
  });
});
