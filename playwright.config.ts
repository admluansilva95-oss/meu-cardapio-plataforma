import { defineConfig, devices } from "@playwright/test";
import { getPublicSupabaseEnvFromFiles, loadLocalEnvFiles } from "./tests/e2e/fixtures/load-env-files";

/** Antes do `webServer` herdar `process.env`, garante `.env.local`, `.env.e2e` na raiz e `tests/e2e/.env.e2e` (Next não lê estes últimos sozinho). */
loadLocalEnvFiles();

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

/** `PW_CHANNEL=chrome npm run test:e2e` usa o Chrome instalado no sistema (útil antes de `npx playwright install`). */
const useSystemChrome = process.env.PW_CHANNEL === "chrome";

/**
 * E2E contra Next.js local ou staging.
 *
 * Integração Supabase (`loadLocalEnvFiles` no topo deste ficheiro + `global-setup`):
 * - E2E_EMAIL, E2E_PASSWORD — obrigatórios para os 6 testes de painel/login autenticado
 * - NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY — obrigatórios no mesmo ficheiro `.env.*` (ou no ambiente); o `webServer` repõe estes dois a partir dos ficheiros após `process.env`
 * - E2E_RESTAURANT_SLUG — opcional; `?slug=` no /admin (tem de pertencer ao dono E2E_EMAIL)
 * - E2E_SKIP_RESTAURANT_CHECK=1 — desliga o pré-flight de `restaurantes` no global-setup
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
        env: {
          ...process.env,
          /** Sobrepõe placeholders no shell / CI: mesmos ficheiros que `loadLocalEnvFiles`. */
          ...getPublicSupabaseEnvFromFiles(),
          /** Visto no bundle; `lib/logging/dev-client-log.ts` silencia ruído esperado nos testes. */
          NEXT_PUBLIC_PLAYWRIGHT_E2E: "1",
        },
      },
});
