import type { CookieOptions } from "@supabase/ssr";
import { getPublicAppUrl } from "@/lib/site-url";

/**
 * Chave de armazenamento GoTrue / cookies do painel (dono).
 * Isola a sessão do proprietário de qualquer futura auth de cliente no mesmo domínio
 * (outra chave: {@link SUPABASE_CLIENT_AUTH_STORAGE_KEY}).
 *
 * Não use prefixo `__Host-` aqui: o Supabase emite múltiplos cookies (chunks + PKCE)
 * e o nome precisa ser estável para `isChunkLike` no `@supabase/ssr`.
 */
export const SUPABASE_OWNER_AUTH_STORAGE_KEY = "sb-rest-owner";

/** Reservado para login de cliente final (vitrine), se existir no futuro. */
export const SUPABASE_CLIENT_AUTH_STORAGE_KEY = "sb-rest-client";

/**
 * Cookies `Secure` quando a origem pública configurada é HTTPS (ou override explícito).
 * Em `http://localhost` permanece `false` para o navegador aceitar o Set-Cookie.
 */
export function shouldUseSecureAuthCookies(): boolean {
  if (process.env.FORCE_INSECURE_AUTH_COOKIES === "1") return false;
  try {
    return getPublicAppUrl().startsWith("https://");
  } catch {
    return process.env.NODE_ENV === "production";
  }
}

/**
 * Opções explícitas para `createServerClient` / rotas que replicam Set-Cookie.
 *
 * **httpOnly: false** — obrigatório no modelo atual: `createBrowserClient` lê a sessão
 * via `document.cookie` para `getSession` / refresh no painel. Se passar `httpOnly: true`,
 * o JS deixa de ver os cookies e a sessão “some” no cliente (até migrar para sessão só servidor).
 */
export function getSupabaseServerCookieOptions(): CookieOptions {
  return {
    path: "/",
    sameSite: "lax",
    secure: shouldUseSecureAuthCookies(),
    httpOnly: false,
  };
}

/** Opções para `createBrowserClient` (serialize em `document.cookie`). */
export function getSupabaseBrowserCookieOptions(): CookieOptions {
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:";
  return {
    path: "/",
    sameSite: "lax",
    secure,
    httpOnly: false,
  };
}

/** `auth.storageKey` idêntico em browser e servidor para a mesma bolha de sessão. */
export function getOwnerAuthStorageOptions() {
  return {
    auth: { storageKey: SUPABASE_OWNER_AUTH_STORAGE_KEY },
  } as const;
}
