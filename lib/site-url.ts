const DEFAULT_PRODUCTION_APP_URL = "https://meu-cardapio-plataforma.vercel.app";

/**
 * Origem absoluta quando `NEXT_PUBLIC_APP_URL` não está definida.
 * Mesma regra do Checkout Stripe: em produção ou em qualquer deploy na Vercel
 * (`VERCEL === '1'`), nunca cair em `localhost` — evita redirects inválidos e
 * `url_invalid` em integrações.
 */
export function resolveDefaultAppOrigin(): string {
  const isProdLike =
    process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  return isProdLike ? DEFAULT_PRODUCTION_APP_URL : "http://localhost:3000";
}

function normalizeAppOrigin(raw: string): string {
  const trimmed = raw.replace(/\/$/, "");
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

/**
 * URL pública do app (sem barra final). Usada em auth (callback, e-mail redirect),
 * comparação de origem em `next`, etc.
 *
 * Prioridade: `NEXT_PUBLIC_APP_URL` normalizado; senão {@link resolveDefaultAppOrigin}.
 */
export function getPublicAppUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) {
    return normalizeAppOrigin(fromEnv);
  }
  return resolveDefaultAppOrigin();
}
