import { expect, test } from "@playwright/test";

test.describe("Segurança — rotas protegidas", () => {
  test("visitante em /admin é redirecionado para /login com ?next=", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
    const url = new URL(page.url());
    expect(url.searchParams.get("next")).toContain("/admin");
  });

  test("visitante em /admin?slug=x continua protegido", async ({ page }) => {
    await page.goto("/admin?slug=teste-slug");
    await expect(page).toHaveURL(/\/login/);
  });

  test("rotas públicas /cadastro e /login não redirecionam para si mesmas", async ({ page }) => {
    await page.goto("/cadastro");
    await expect(page).toHaveURL(/\/cadastro/);
    await expect(page.getByRole("heading", { name: /Crie sua conta/i })).toBeVisible({ timeout: 15_000 });

    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /Entrar com segurança/i })).toBeVisible({ timeout: 15_000 });
  });
});
