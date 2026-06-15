import "@/lib/wire/bootstrap-byte-string-guard";
import { createBrowserClient } from "@supabase/ssr";
import { getNativeHeaders } from "@/lib/http/native-http-constructors";
import { getPublicSupabaseProjectUrl } from "@/lib/supabase/normalize-public-supabase-url";
import { getNativeFetchForSupabase } from "@/lib/wire/install-client-byte-string-guard";
import {
  getOwnerAuthStorageOptions,
  getSupabaseBrowserCookieOptions,
} from "@/lib/auth/supabase-session-cookies";

/**
 * PostgREST exige `Content-Type: application/json` para corpos JSON. Se o cabeçalho faltar
 * (ou for `text/plain`, omissão típica do fetch para `body` string), o servidor responde
 * `Content-Type not acceptable: text/plain`.
 */
function wrapFetchEnsureRestJsonContentType(base: typeof fetch): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (init == null) return base(input, init);

    const urlStr =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : typeof Request !== "undefined" && input instanceof Request
            ? input.url
            : "";
    if (!urlStr.includes("/rest/v1")) return base(input, init);

    const { body, method = "GET" } = init;
    if (typeof body !== "string" || body.length === 0) return base(input, init);

    const m = method.toUpperCase();
    if (m === "GET" || m === "HEAD") return base(input, init);

    const trimmed = body.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return base(input, init);

    const H = getNativeHeaders();
    const h = new H(init.headers as HeadersInit | undefined);
    const ct = (h.get("content-type") ?? "").toLowerCase();
    if (!ct || ct.startsWith("text/plain")) {
      h.set("Content-Type", "application/json");
      return base(input, { ...init, headers: h });
    }
    return base(input, init);
  };
}

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
    global: { fetch: wrapFetchEnsureRestJsonContentType(getNativeFetchForSupabase()) },
    cookieOptions: getSupabaseBrowserCookieOptions(),
    ...getOwnerAuthStorageOptions(),
  });
}