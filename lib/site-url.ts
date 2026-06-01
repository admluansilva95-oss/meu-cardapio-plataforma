/**
 * URL pública do app (sem barra final). Usada em redirects de auth, Stripe, etc.
 */
export function getPublicAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}
