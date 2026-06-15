import type { Page } from "@playwright/test";
import { fillWhenHydrated } from "../fill-hydrated";
import { submitLoginForm } from "./submit-form";

export async function loginWithE2eUser(page: Page): Promise<void> {
  const email = process.env.E2E_EMAIL!.trim();
  const password = process.env.E2E_PASSWORD!;
  await page.goto("/login");
  await page.getByRole("heading", { name: /Entrar com segurança/i }).waitFor({ timeout: 20_000 });
  const form = page.getByTestId("login-form");
  await form.waitFor({ state: "visible", timeout: 15_000 });
  /** Mesmo padrão que `login.spec.ts` (credenciais inválidas): inputs controlados podem repor o valor antes da hidratação. */
  await fillWhenHydrated(form.locator("#email"), email);
  await fillWhenHydrated(form.locator("#password"), password);
  await submitLoginForm(page);
  try {
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
  } catch {
    const hint =
      page.isClosed() ? "" : (await page.getByTestId("login-error").textContent())?.trim() || "";
    let raw = "";
    if (!page.isClosed()) {
      const rawLoc = page.locator('[data-testid="login-error-raw"]');
      if ((await rawLoc.count()) > 0) {
        raw = (await rawLoc.textContent())?.trim() || "";
      }
    }
    throw new Error(
      `E2E: continua em /login após enviar credenciais (ver E2E_EMAIL / E2E_PASSWORD e o projeto Supabase).${
        hint ? ` Mensagem na página: ${hint}` : ""
      }${raw ? ` Detalhe (GoTrue/SDK): ${raw}` : ""}`,
    );
  }
}
