import "@/lib/wire/bootstrap-byte-string-guard";
import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseProjectUrl } from "@/lib/supabase/normalize-public-supabase-url";
import { getNativeFetchForSupabase } from "@/lib/wire/install-client-byte-string-guard";
import {
  getOwnerAuthStorageOptions,
  getSupabaseBrowserCookieOptions,
} from "@/lib/auth/supabase-session-cookies";

/**
 * Cliente Supabase no navegador (Client Components).
 *
 * Usa o **`fetch` nativo** guardado em `installClientByteStringGuard` **antes** do patch global
 * (`createLatin1SafeFetch`), para não empilhar dois wrappers — o segundo recebia já o `fetch`
 * instrumentado e podia degradar pedidos ao GoTrue (ex.: erros tipo “no api key”).
 * O resto da app continua com `fetch` / `Headers` / `Request` instrumentados via layout.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient(getPublicSupabaseProjectUrl(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { fetch: getNativeFetchForSupabase() },
    cookieOptions: getSupabaseBrowserCookieOptions(),
    ...getOwnerAuthStorageOptions(),
  });
}