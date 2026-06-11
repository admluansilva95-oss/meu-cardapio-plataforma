import { jsonStringifyLatin1Wire, latin1SafeString } from "@/lib/restaurante/json-latin1-wire";
import { sanitizeUserFreeText } from "@/lib/utils/sanitize-strings";

export function cloneHeadersLatin1Safe(headers: Headers): Headers {
  const fixed = new Headers();
  headers.forEach((value, key) => {
    fixed.set(latin1SafeString(key), sanitizeUserFreeText(value));
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

/** JSON como `Blob` de bytes UTF-8 (via `TextEncoder`), sem passar a string UTF-16 direto ao `Blob`. */
function jsonBodyUtf8Blob(json: string): Blob {
  return new Blob([new TextEncoder().encode(json)], {
    type: "application/json; charset=utf-8",
  });
}

function isBufferSourceJsonBody(body: RequestInit["body"]): boolean {
  if (body == null) return false;
  if (body instanceof Blob) return true;
  if (typeof ArrayBuffer !== "undefined") {
    if (body instanceof ArrayBuffer) return true;
    if (ArrayBuffer.isView(body)) return true;
  }
  return false;
}

function isFormDataBody(body: RequestInit["body"]): boolean {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

function sanitizeReferrer(ref: RequestInit["referrer"]): RequestInit["referrer"] {
  if (typeof ref !== "string" || ref.length === 0) return ref;
  const t = sanitizeUserFreeText(ref);
  return t.length > 0 ? t : undefined;
}

/**
 * Ajusta `RequestInit` para evitar `TypeError: ByteString` ao chamar `fetch`:
 * cabeçalhos só podem ser Latin-1 em alguns runtimes; corpo JSON com •, emojis, etc.
 * também pode disparar o erro quando o runtime trata o payload de forma estrita.
 */
export function sanitizeFetchInit(init: RequestInit): RequestInit {
  const out: RequestInit = { ...init };

  if (typeof out.body === "string") {
    out.body = jsonBodyUtf8Blob(sanitizeJsonBodyString(out.body));
  }

  out.referrer = sanitizeReferrer(out.referrer);

  const headersSource = out.headers != null ? (out.headers as HeadersInit) : undefined;
  const h = new Headers(headersSource);

  /*
   * Sempre clonar cabeçalhos quando há corpo não-string:
   * - Blob/BufferSource: SDKs (ex.: Supabase Storage) podem fundir `headers` planos com valores não Latin-1.
   * - FormData: `Content-Disposition` / metadados vêm dos cabeçalhos auxiliares; sem headers explícitos
   *   usamos `Headers` vazio para não bloquear o `multipart boundary` automático do `fetch`.
   */
  if (out.headers != null || isBufferSourceJsonBody(out.body) || isFormDataBody(out.body)) {
    out.headers = cloneHeadersLatin1Safe(h);
  } else {
    out.headers = undefined;
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
  const json = jsonStringifyLatin1Wire(payload);
  return {
    method: "POST",
    headers: cloneHeadersLatin1Safe(
      new Headers({
        Authorization: `Bearer ${sanitizeUserFreeText(bearerToken.trim())}`,
        "Content-Type": "application/json; charset=utf-8",
      }),
    ),
    credentials: "include",
    cache: "no-store",
    body: jsonBodyUtf8Blob(json),
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
      referrer: sanitizeReferrer(input.referrer),
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
      referrer: sanitizeReferrer(input.referrer),
      referrerPolicy: input.referrerPolicy,
      integrity: input.integrity,
      keepalive: input.keepalive,
      signal: input.signal,
    });
    return baseFetch(req);
  }

  /* `Request` com FormData: nunca ler como texto (quebra upload / ByteString). */
  if (isFormDataBody(input.body)) {
    const req = new Request(input.url, {
      method,
      headers: cloneHeadersLatin1Safe(input.headers),
      body: input.body,
      mode: input.mode,
      credentials: input.credentials,
      cache: input.cache,
      redirect: input.redirect,
      referrer: sanitizeReferrer(input.referrer),
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
    const h = cloneHeadersLatin1Safe(input.headers);
    const req = new Request(input.url, {
      method,
      headers: h,
      body: jsonBodyUtf8Blob(bodyOut),
      mode: input.mode,
      credentials: input.credentials,
      cache: input.cache,
      redirect: input.redirect,
      referrer: sanitizeReferrer(input.referrer),
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
