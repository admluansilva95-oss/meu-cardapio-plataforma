import { jsonStringifyLatin1Wire, expandLatin1UserText, latin1SafeString } from "@/lib/restaurante/json-latin1-wire";

export function cloneHeadersLatin1Safe(headers: Headers): Headers {
  const fixed = new Headers();
  headers.forEach((value, key) => {
    fixed.set(latin1SafeString(key), expandLatin1UserText(value));
  });
  return fixed;
}

function sanitizeJsonBodyString(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      return jsonStringifyLatin1Wire(JSON.parse(raw));
    } catch {
      return latin1SafeString(raw);
    }
  }
  return latin1SafeString(raw);
}

/**
 * Ajusta `RequestInit` para evitar `TypeError: ByteString` ao chamar `fetch`:
 * cabeçalhos só podem ser Latin-1 em alguns runtimes; corpo JSON com •, emojis, etc.
 * também pode disparar o erro quando o runtime trata o payload de forma estrita.
 */
export function sanitizeFetchInit(init: RequestInit): RequestInit {
  const out: RequestInit = { ...init };

  if (typeof out.body === "string") {
    out.body = sanitizeJsonBodyString(out.body);
  }

  if (out.headers != null) {
    out.headers = cloneHeadersLatin1Safe(new Headers(out.headers as HeadersInit));
  }

  return out;
}

/** `fetch` global com sanitização de `Request` (recomendado para chamadas fora do cliente Supabase). */
export const latin1SafeFetch = createLatin1SafeFetch();

/**
 * `RequestInit` para POST JSON já 100% compatível com ByteString (corpo + cabeçalhos).
 * Use com `latin1SafeFetch(url, initJsonPost(payload, token))`.
 */
export function initJsonPost(payload: unknown, bearerToken: string): RequestInit {
  return {
    method: "POST",
    headers: cloneHeadersLatin1Safe(
      new Headers({
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerToken}`,
      }),
    ),
    credentials: "include",
    cache: "no-store",
    body: jsonStringifyLatin1Wire(payload),
  };
}

async function fetchWithSanitizedRequest(input: Request, baseFetch: typeof fetch): Promise<Response> {
  const method = input.method;
  const noBody = method === "GET" || method === "HEAD" || input.body == null;

  if (noBody) {
    const req = new Request(input.url, {
      method,
      headers: cloneHeadersLatin1Safe(input.headers),
      mode: input.mode,
      credentials: input.credentials,
      cache: input.cache,
      redirect: input.redirect,
      referrer: input.referrer,
      referrerPolicy: input.referrerPolicy,
      integrity: input.integrity,
      keepalive: input.keepalive,
      signal: input.signal,
    });
    return baseFetch(req);
  }

  const ct = (input.headers.get("content-type") ?? "").toLowerCase();
  if (ct.includes("multipart/") || ct.includes("application/octet-stream")) {
    const req = new Request(input.url, {
      method,
      headers: cloneHeadersLatin1Safe(input.headers),
      body: input.body,
      mode: input.mode,
      credentials: input.credentials,
      cache: input.cache,
      redirect: input.redirect,
      referrer: input.referrer,
      referrerPolicy: input.referrerPolicy,
      integrity: input.integrity,
      keepalive: input.keepalive,
      signal: input.signal,
    });
    return baseFetch(req);
  }

  try {
    const text = await input.clone().text();
    const bodyOut = sanitizeJsonBodyString(text);
    const req = new Request(input.url, {
      method,
      headers: cloneHeadersLatin1Safe(input.headers),
      body: bodyOut,
      mode: input.mode,
      credentials: input.credentials,
      cache: input.cache,
      redirect: input.redirect,
      referrer: input.referrer,
      referrerPolicy: input.referrerPolicy,
      integrity: input.integrity,
      keepalive: input.keepalive,
      signal: input.signal,
    });
    return baseFetch(req);
  } catch {
    return baseFetch(input);
  }
}

/** `fetch` que sanitiza `init` e também `Request` usado sem segundo argumento (alguns SDKs). */
export function createLatin1SafeFetch(
  baseFetch: typeof fetch = globalThis.fetch.bind(globalThis),
): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (input instanceof Request && init === undefined) {
      return fetchWithSanitizedRequest(input, baseFetch);
    }
    return baseFetch(input, init == null ? init : sanitizeFetchInit(init));
  };
}
