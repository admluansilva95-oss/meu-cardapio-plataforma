import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

/** `PW_CHANNEL=chrome npm run test:e2e` usa o Chrome instalado no sistema (útil antes de `npx playwright install`). */
const useSystemChrome = process.env.PW_CHANNEL === "chrome";

/**
 * E2E contra Next.js local ou staging.
 *
 * Integração Supabase (carrega `.env.local` / `.env.e2e` antes dos testes):
 * - E2E_EMAIL, E2E_PASSWORD — obrigatórios para os 6 testes de painel/login autenticado
 * - E2E_RESTAURANT_SLUG — opcional; `?slug=` no /admin. Sem assinatura ativa use-se `checkout=success` no helper.
 */
export default defineConfig({
  globalSetup: "./tests/e2e/global-setup.ts",
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: process.env.PW_RECORD_VIDEO === "1" ? "retain-on-failure" : "off",
  },
  projects: [
    {
      name: useSystemChrome ? "chrome" : "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(useSystemChrome ? { channel: "chrome" as const } : {}),
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
