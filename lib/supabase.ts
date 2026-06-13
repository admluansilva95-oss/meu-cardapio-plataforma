import "@/lib/wire/bootstrap-byte-string-guard";
import { createBrowserClient } from "@supabase/ssr";
import { createLatin1SafeFetch } from "@/lib/fetch-latin1-safe";
import {
  getOwnerAuthStorageOptions,
  getSupabaseBrowserCookieOptions,
} from "@/lib/auth/supabase-session-cookies";

const browserSafeFetch = createLatin1SafeFetch();

/**
 * Cliente Supabase no navegador (Client Components).
 *
 * **Zero trust na camada HTTP:** `global.fetch` + `Headers`/`Request`/`FormData.append`
 * são instrumentados em `installClientByteStringGuard` (carregado antes deste módulo via
 * `@/lib/wire/bootstrap-byte-string-guard` e `app/layout.tsx`). Aqui forçamos ainda
 * `createBrowserClient` a usar `createLatin1SafeFetch`, duplicando a defesa para chamadas
 * internas do SDK (PostgREST, Auth, Storage).
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: browserSafeFetch },
      cookieOptions: getSupabaseBrowserCookieOptions(),
      ...getOwnerAuthStorageOptions(),
    },
  );
}