import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** `HTMLElement.click()` dispara o mesmo fluxo que um clique de utilizador (Playwright `.click()` por vezes não dispara `onClick` em botões com gradiente/overlay). */
export async function submitCadastroForm(page: Page) {
  const btn = page.getByTestId("cadastro-submit");
  await expect(btn).toBeEnabled({ timeout: 10_000 });
  await btn.evaluate((el: HTMLButtonElement) => {
    el.click();
  });
}

export async function submitLoginForm(page: Page) {
  const btn = page.getByTestId("login-submit");
  await expect(btn).toBeEnabled({ timeout: 10_000 });
  await btn.evaluate((el: HTMLButtonElement) => {
    el.click();
  });
}
