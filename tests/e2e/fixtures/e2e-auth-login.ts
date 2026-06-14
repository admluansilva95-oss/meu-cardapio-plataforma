import type { Page } from "@playwright/test";

export async function loginWithE2eUser(page: Page): Promise<void> {
  const email = process.env.E2E_EMAIL!.trim();
  const password = process.env.E2E_PASSWORD!;
  await page.goto("/login");
  await page.getByRole("heading", { name: /Entrar com segurança/i }).waitFor({ timeout: 20_000 });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /Entrar|Continuar para assinatura/i }).click();
  try {
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
  } catch {
    const hint = (await page.getByTestId("login-error").textContent())?.trim() || "";
    throw new Error(
      `E2E: continua em /login após enviar credenciais (ver E2E_EMAIL / E2E_PASSWORD e o projeto Supabase).${
        hint ? ` Mensagem na página: ${hint}` : ""
      }`,
    );
  }
}
