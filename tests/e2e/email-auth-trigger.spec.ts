import { expect, test } from "@playwright/test";
import { parseJsonBodyFromRouteRequest } from "./fixtures/parse-route-json-body";
import { submitCadastroForm } from "./fixtures/submit-form";

/**
 * O fluxo de cadastro chama `signUp` no **Supabase Auth** (GoTrue). Com confirmação de e-mail
 * opcional/desativada, o envio de e-mail deixa de ser o foco — este teste garante que o
 * **POST /auth/v1/signup** continua a ser feito com `email` (e corpo JSON legível pelo Playwright).
 *
 * Para inspecionar e-mail real (Mailpit / Inbucket / painel Supabase), use ambiente dedicado.
 *
 * **Recuperação de senha:** a UI atual não expõe `resetPasswordForEmail`. Quando existir,
 * adicionar teste com `page.route('** /auth/v1/recover**', …)` — ver `tests/e2e/EMAIL_AND_AUTH.md`.
 */
test.describe("Pedido HTTP de cadastro (Supabase Auth)", () => {
  test("cadastro chama POST /auth/v1/signup com e-mail no corpo", async ({ page }) => {
    let posted: Record<string, unknown> | null = null;

    await page.route("**/auth/v1/signup**", async (route) => {
      posted = parseJsonBodyFromRouteRequest(route);
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
