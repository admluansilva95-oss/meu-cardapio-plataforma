/**
 * Logs apenas no browser em desenvolvimento — evita ruído e detalhes
 * de depuração no console do utilizador em produção.
 */
export function devClientError(...args: unknown[]): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "production") return;
  console.error(...args);
}

export function devClientWarn(...args: unknown[]): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "production") return;
  console.warn(...args);
}
