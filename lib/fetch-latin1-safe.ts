import { jsonStringifyLatin1Wire, latin1SafeString } from "@/lib/restaurante/json-latin1-wire";

/**
 * Ajusta `RequestInit` para evitar `TypeError: ByteString` ao chamar `fetch`:
 * cabeçalhos só podem ser Latin-1 em alguns engines; corpo JSON com •, emojis, etc.
 * também pode disparar o erro quando o runtime trata o payload de forma estrita.
 */
export function sanitizeFetchInit(init: RequestInit): RequestInit {
  const out: RequestInit = { ...init };

  if (typeof out.body === "string") {
    const t = out.body.trim();
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        out.body = jsonStringifyLatin1Wire(JSON.parse(out.body));
      } catch {
        out.body = latin1SafeString(out.body);
      }
    }
  }

  if (out.headers != null) {
    const h = new Headers(out.headers as HeadersInit);
    const fixed = new Headers();
    h.forEach((value, key) => {
      fixed.set(latin1SafeString(key), latin1SafeString(value));
    });
    out.headers = fixed;
  }

  return out;
}

/** `fetch` que sanitiza `init` antes de delegar (útil no cliente Supabase). */
export function createLatin1SafeFetch(
  baseFetch: typeof fetch = globalThis.fetch.bind(globalThis),
): typeof fetch {
  return (input, init) => baseFetch(input, init == null ? init : sanitizeFetchInit(init));
}
