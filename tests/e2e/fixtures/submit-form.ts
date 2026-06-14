import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Clique no botão (Playwright) para disparar `onClick` do React.
 */
export async function submitCadastroForm(page: Page) {
  const btn = page.getByTestId("cadastro-submit");
  await expect(btn).toBeVisible({ timeout: 10_000 });
  await expect(btn).toBeEnabled({ timeout: 10_000 });
  await btn.click();
}

export async function submitLoginForm(page: Page) {
  const btn = page.getByTestId("login-submit");
  await expect(btn).toBeVisible({ timeout: 10_000 });
  await expect(btn).toBeEnabled({ timeout: 10_000 });
  await btn.click();
}
