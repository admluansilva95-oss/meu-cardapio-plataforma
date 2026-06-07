const DEFAULT_PRODUCTION_APP_URL = "https://meu-cardapio-plataforma.vercel.app";

function stripSurroundingQuotes(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const t = value.trim();
  if (!t) return undefined;
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).trim() || undefined;
  }
  return t;
}

/** Tenta obter uma origem absoluta válida (http/https). Retorna `null` se `raw` for ilegível. */
function tryParsePublicOrigin(raw: string): string | null {
  try {
    const trimmed = raw.trim().replace(/\/$/, "");
    const withScheme = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed.replace(/^\/+/, "")}`;
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Origem absoluta quando `NEXT_PUBLIC_APP_URL` não está definida ou é inválida.
 * Em produção ou em deploy na Vercel (`VERCEL === '1'`), nunca cair em `localhost`.
 */
export function resolveDefaultAppOrigin(): string {
  const isProdLike =
    process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  return isProdLike ? DEFAULT_PRODUCTION_APP_URL : "http://localhost:3000";
}

/**
 * Origem para `success_url` / `cancel_url` do Stripe Checkout.
 *
 * Ordem: `NEXT_PUBLIC_APP_URL` (parseável) → `VERCEL_URL` do deploy → {@link resolveDefaultAppOrigin}.
 * Evita `url_invalid` por env com aspas (Netlify/Vercel), host sem esquema ou valor quebrado.
 */
export function resolveStripeCheckoutOrigin(): string {
  const fromEnv = stripSurroundingQuotes(process.env.NEXT_PUBLIC_APP_URL);
  if (fromEnv) {
    const origin = tryParsePublicOrigin(fromEnv);
    if (origin) return origin;
  }

  const vercelHost = process.env.VERCEL_URL?.trim();
  if (vercelHost) {
    const hostOnly = vercelHost.replace(/^https?:\/\//i, "").split("/")[0];
    if (hostOnly) {
      const origin = tryParsePublicOrigin(`https://${hostOnly}`);
      if (origin) return origin;
    }
  }

  return resolveDefaultAppOrigin();
}

/**
 * URL pública do app (sem barra final). Auth, e-mail redirect, comparação de `next`, etc.
 */
export function getPublicAppUrl(): string {
  const fromEnv = stripSurroundingQuotes(process.env.NEXT_PUBLIC_APP_URL);
  if (fromEnv) {
    const origin = tryParsePublicOrigin(fromEnv);
    if (origin) return origin;
  }
  return resolveDefaultAppOrigin();
}
