const DEFAULT_PRODUCTION_APP_URL = "https://meu-cardapio-plataforma.vercel.app";

/**
 * URL pública absoluta do app (sem barra final). Usada em redirects de auth, Stripe, etc.
 * Em produção sem NEXT_PUBLIC_APP_URL, evita fallback para localhost (Stripe rejeita com url_invalid).
 */
export function getPublicAppUrl(): string {
  const isDev = process.env.NODE_ENV === "development";
  const fallback = isDev ? "http://localhost:3000" : DEFAULT_PRODUCTION_APP_URL;
  const raw = (process.env.NEXT_PUBLIC_APP_URL?.trim() || fallback).replace(/\/$/, "");

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  return `https://${raw.replace(/^\/+/, "")}`;
}
