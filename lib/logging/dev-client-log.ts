/**
 * Playwright injeta isto ao subir `npm run dev` — evita `console.error` esperado
 * (ex.: credenciais inválidas mockadas) a poluir o output do WebServer.
 */
function silenceDevClientLogsForPlaywrightE2e(): boolean {
  return process.env.NEXT_PUBLIC_PLAYWRIGHT_E2E === "1";
}

/**
 * Logs apenas no browser em desenvolvimento — evita ruído e detalhes
 * de depuração no console do utilizador em produção.
 */
export function devClientError(...args: unknown[]): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "production") return;
  if (silenceDevClientLogsForPlaywrightE2e()) return;
  console.error(...args);
}

export function devClientWarn(...args: unknown[]): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "production") return;
  if (silenceDevClientLogsForPlaywrightE2e()) return;
  console.warn(...args);
}
