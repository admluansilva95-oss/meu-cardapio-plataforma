import { jsonStringifyLatin1Wire, latin1SafeString } from "@/lib/restaurante/json-latin1-wire";
import { sanitizeUserFreeText } from "@/lib/utils/sanitize-strings";

/**
 * Constrói `Headers` só com pares Latin-1 seguros.
 *
 * **Nunca** use `new Headers(init)` com `init` vindo de SDKs (PostgREST, etc.): se algum valor
 * tiver `•` (U+2022) ou fora de Latin-1, o Chromium lança `TypeError: ByteString` **na construção**
 * — antes de qualquer `forEach` poder sanitizar.
 */
export function cloneHeadersLatin1Safe(source?: HeadersInit | null): Headers {
  const fixed = new Headers();
  if (source == null) return fixed;

  const apply = (nameRaw: string, valueRaw: string, append: boolean) => {
    const name = latin1SafeString(nameRaw);
    const value = sanitizeUserFreeText(valueRaw);
    if (!name) return;
    try {
      if (append) fixed.append(name, value);
      else fixed.set(name, value);
    } catch {
      /* par inválido mesmo após higienizar — ignorar */
    }
  };

  if (typeof Headers !== "undefined" && source instanceof Headers) {
    source.forEach((value, key) => {
      apply(key, value, false);
    });
    return fixed;
  }

  if (Array.isArray(source)) {
    for (const row of source) {
      if (!row || row.length < 2) continue;
      apply(String(row[0]), String(row[1]), false);
    }
    return fixed;
  }

  if (typeof source === "object") {
    for (const [keyRaw, val] of Object.entries(source as Record<string, unknown>)) {
      if (typeof val === "string") {
        apply(keyRaw, val, false);
      } else if (Array.isArray(val)) {
        for (const item of val) {
          if (typeof item === "string") apply(keyRaw, item, true);
        }
      }
    }
  }

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

function isFormDataBody(body: RequestInit["body"]): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

function sanitizeReferrer(ref: RequestInit["referrer"]): RequestInit["referrer"] {
  if (typeof ref !== "string" || ref.length === 0) return ref;
  const t = sanitizeUserFreeText(ref);
  return t.length > 0 ? t : undefined;
}

/** `File.name` / `Blob.type` fora de Latin-1 quebram multipart (`Content-Disposition`) no Chromium. */
function sanitizeBlobLikeForFetch(body: Blob): Blob {
  if (body instanceof File) {
    const type = latin1SafeString(body.type) || "application/octet-stream";
    let name = sanitizeUserFreeText(body.name).trim();
    if (!name) name = "file.bin";
    if (type === body.type && name === body.name) return body;
    return new File([body], name, { type, lastModified: body.lastModified });
  }
  const type = latin1SafeString(body.type);
  if (!type || type === body.type) return body;
  return new Blob([body], { type });
}

/** Reconstrói `FormData` com chaves/valores Latin-1 e ficheiros com nome/`type` seguros no wire. */
function sanitizeFormDataForWire(fd: FormData): FormData {
  const next = new FormData();
  for (const [key, val] of fd.entries()) {
    const keyS = latin1SafeString(String(key));
    if (typeof val === "string") {
      next.append(keyS, sanitizeUserFreeText(val));
    } else if (typeof Blob !== "undefined" && val instanceof File) {
      const f = sanitizeBlobLikeForFetch(val);
      if (f instanceof File) {
        next.append(keyS, f, f.name);
      } else {
        next.append(keyS, f);
      }
    } else if (typeof Blob !== "undefined" && val instanceof Blob) {
      next.append(keyS, sanitizeBlobLikeForFetch(val));
    }
  }
  return next;
}

function sanitizeRequestInitByteStrings(out: RequestInit): void {
  if (typeof out.method === "string") {
    const m = latin1SafeString(out.method.trim().toUpperCase());
    out.method = m && /^[A-Z-]+$/.test(m) ? m : "GET";
  }
  const stringKeys = ["cache", "mode", "referrerPolicy", "integrity", "redirect"] as const;
  for (const k of stringKeys) {
    const v = out[k];
    if (typeof v === "string") {
      const s = latin1SafeString(v);
      (out as Record<string, unknown>)[k] = s.length > 0 ? s : undefined;
    }
  }
  if (typeof (out as { duplex?: unknown }).duplex === "string") {
    const raw = (out as { duplex?: string }).duplex;
    const d = latin1SafeString(raw ?? "");
    if (d.length > 0) (out as { duplex?: string }).duplex = d;
    else delete (out as { duplex?: string }).duplex;
  }
}

/**
 * Ajusta `RequestInit` para evitar `TypeError: ByteString` ao chamar `fetch`:
 * cabeçalhos só podem ser Latin-1 em alguns runtimes; corpo JSON com •, emojis, etc.
 * também pode disparar o erro quando o runtime trata o payload de forma estrita.
 */
export function sanitizeFetchInit(init: RequestInit): RequestInit {
  const out: RequestInit = { ...init };
  sanitizeRequestInitByteStrings(out);

  if (typeof out.body === "string") {
    out.body = jsonBodyUtf8Blob(sanitizeJsonBodyString(out.body));
  }

  if (out.body != null && typeof Blob !== "undefined") {
    if (isFormDataBody(out.body)) {
      const fd = out.body;
      out.body = sanitizeFormDataForWire(fd);
    } else if (out.body instanceof Blob) {
      const b = sanitizeBlobLikeForFetch(out.body);
      if (b !== out.body) out.body = b;
    }
  }

  out.referrer = sanitizeReferrer(out.referrer);

  const headersSource = out.headers != null ? (out.headers as HeadersInit) : undefined;
  const h = cloneHeadersLatin1Safe(headersSource);

  /*
   * Sempre clonar cabeçalhos quando há corpo não-string:
   * - Blob/BufferSource: SDKs (ex.: Supabase Storage) podem fundir `headers` planos com valores não Latin-1.
   * - FormData: `Content-Disposition` / metadados vêm dos cabeçalhos auxiliares; sem headers explícitos
   *   usamos `Headers` vazio para não bloquear o `multipart boundary` automático do `fetch`.
   */
  if (out.headers != null || isBufferSourceJsonBody(out.body) || isFormDataBody(out.body)) {
    out.headers = h;
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
    headers: cloneHeadersLatin1Safe({
      Authorization: `Bearer ${sanitizeUserFreeText(bearerToken.trim())}`,
      "Content-Type": "application/json; charset=utf-8",
    }),
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

  /* FormData antes do ramo multipart: o `Content-Type` costuma ser multipart e o corpo precisa de nomes Latin-1. */
  if (isFormDataBody(input.body)) {
    const safeBody = sanitizeFormDataForWire(input.body);
    const req = new Request(input.url, {
      method,
      headers: cloneHeadersLatin1Safe(input.headers),
      body: safeBody,
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
    const raw = input.body;
    const safeBody =
      typeof Blob !== "undefined" && raw != null && raw instanceof Blob ? sanitizeBlobLikeForFetch(raw) : raw;
    const req = new Request(input.url, {
      method,
      headers: cloneHeadersLatin1Safe(input.headers),
      body: safeBody,
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
