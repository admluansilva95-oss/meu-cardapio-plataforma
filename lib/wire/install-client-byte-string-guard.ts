import {
  NativeFormData,
  NativeHeaders,
  NativeRequest,
} from "@/lib/http/native-http-constructors";
import {
  cloneHeadersLatin1Safe,
  createLatin1SafeFetch,
  sanitizeBlobForWire,
  sanitizeFetchInit,
  sanitizeRequestConstructorArgs,
} from "@/lib/fetch-latin1-safe";
import { latin1SafeString, sanitizeUserFreeText, stripInvisibleFormatting } from "@/lib/utils/sanitize-strings";

let formDataAppendGuardInstalled = false;

/** `fetch` nativo antes do patch (evita `createLatin1SafeFetch(createLatin1SafeFetch(native))` no `lib/supabase.ts`). */
let nativeFetchForSupabase: typeof fetch | null = null;

/** Para `createBrowserClient`: usa o `fetch` do runtime sem o wrapper `createLatin1SafeFetch`. */
export function getNativeFetchForSupabase(): typeof fetch {
  return nativeFetchForSupabase ?? globalThis.fetch.bind(globalThis);
}

declare global {
  interface Window {
    __BYTE_STRING_GUARD__?: true;
  }
}

function installHeadersZeroTrust(): void {
  if (typeof NativeHeaders === "undefined") return;
  if (globalThis.Headers !== NativeHeaders) return;

  const NH = NativeHeaders;

  const Wrapped = new Proxy(NH, {
    construct(_target, args: [HeadersInit?]) {
      if (!args?.length || args[0] === undefined) return new NH();
      return cloneHeadersLatin1Safe(args[0] as HeadersInit);
    },
  }) as unknown as typeof Headers;

  Object.defineProperty(Wrapped, Symbol.hasInstance, {
    configurable: true,
    value(_ctor: unknown, instance: unknown) {
      return (
        typeof instance === "object" &&
        instance !== null &&
        NH.prototype.isPrototypeOf(instance as object)
      );
    },
  });

  globalThis.Headers = Wrapped;
}

function installRequestZeroTrust(): void {
  if (typeof NativeRequest === "undefined") return;
  if (globalThis.Request !== NativeRequest) return;

  const NR = NativeRequest;

  const Wrapped = new Proxy(NR, {
    construct(_target, args: ConstructorParameters<typeof Request>) {
      const [input, init] = args;
      if (typeof input === "string") {
        return new NR(
          latin1SafeString(input),
          init == null ? undefined : sanitizeFetchInit({ ...init }),
        );
      }
      if (typeof URL !== "undefined" && input instanceof URL) {
        return new NR(input, init == null ? undefined : sanitizeFetchInit({ ...init }));
      }
      if (input instanceof NR) {
        const [url, merged] = sanitizeRequestConstructorArgs(input, init);
        return new NR(url, merged);
      }
      return new NR(
        input as unknown as RequestInfo,
        init == null ? undefined : sanitizeFetchInit({ ...init }),
      );
    },
  }) as unknown as typeof Request;

  Object.defineProperty(Wrapped, Symbol.hasInstance, {
    configurable: true,
    value(_ctor: unknown, instance: unknown) {
      return (
        typeof instance === "object" &&
        instance !== null &&
        NR.prototype.isPrototypeOf(instance as object)
      );
    },
  });

  globalThis.Request = Wrapped;
}

function installFormDataAppendZeroTrust(): void {
  if (typeof NativeFormData === "undefined" || formDataAppendGuardInstalled) return;
  const NF = NativeFormData;
  const proto = NF.prototype as FormData & { append: typeof FormData.prototype.append };
  const origAppend = proto.append as (
    this: FormData,
    name: string,
    value: string | Blob,
    filename?: string,
  ) => void;
  formDataAppendGuardInstalled = true;

  proto.append = function appendWireSafe(
    this: FormData,
    name: string,
    value: string | Blob,
    filename?: string,
  ): void {
    const key = latin1SafeString(String(name));
    if (arguments.length >= 3 && typeof filename === "string") {
      origAppend.call(this, key, value as Blob, sanitizeUserFreeText(filename));
      return;
    }
    if (typeof value === "string") {
      origAppend.call(this, key, sanitizeUserFreeText(value));
      return;
    }
    if (typeof File !== "undefined" && value instanceof File) {
      const f = sanitizeBlobForWire(value);
      if (f instanceof File) {
        origAppend.call(this, key, f, f.name);
      } else {
        origAppend.call(this, key, f);
      }
      return;
    }
    if (typeof Blob !== "undefined" && value instanceof Blob) {
      origAppend.call(this, key, sanitizeBlobForWire(value));
      return;
    }
    origAppend.call(this, key, value as Blob);
  };
}

/**
 * Instala barreira **zero trust** no cliente contra `TypeError: ByteString` (Latin-1 / wire HTTP):
 * - `fetch` → `createLatin1SafeFetch` (URL string, `Request` + `init`, `RequestInit`).
 * - `Headers` → construtor sanitiza qualquer `HeadersInit` (nunca deixa o Chromium lançar na construção).
 * - `Request` → construtor sanitiza URL + `RequestInit` / reutilização de `Request` existente.
 * - `FormData.prototype.append` → chaves, `filename` e `File`/`Blob` com metadados seguros.
 * - `XMLHttpRequest` → método, URL, cabeçalhos e corpo string (UTF-8 em `ArrayBuffer`).
 *
 * Idempotente (`window.__BYTE_STRING_GUARD__`). No servidor não faz nada.
 */
export function installClientByteStringGuard(): void {
  if (typeof window === "undefined" || window.__BYTE_STRING_GUARD__) return;
  window.__BYTE_STRING_GUARD__ = true;

  try {
    nativeFetchForSupabase = globalThis.fetch.bind(globalThis);
    globalThis.fetch = createLatin1SafeFetch(nativeFetchForSupabase);
    try {
      window.fetch = globalThis.fetch;
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }

  try {
    installHeadersZeroTrust();
  } catch {
    /* ignore */
  }

  try {
    installRequestZeroTrust();
  } catch {
    /* ignore */
  }

  try {
    installFormDataAppendZeroTrust();
  } catch {
    /* ignore */
  }

  try {
    if (typeof XMLHttpRequest !== "undefined") {
      const XP = XMLHttpRequest.prototype;
      const origOpen = XP.open;
      XP.open = function openPatched(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
        const mRaw = latin1SafeString(String(method ?? "").trim().toUpperCase());
        const methodS = mRaw && /^[A-Z-]+$/.test(mRaw) ? mRaw : "GET";
        const u = typeof url === "string" ? latin1SafeString(url) : url;
        return (origOpen as (this: XMLHttpRequest, ...args: unknown[]) => void).apply(this, [
          methodS,
          u,
          ...rest,
        ]);
      };

      const origSetRequestHeader = XP.setRequestHeader;
      XP.setRequestHeader = function setRequestHeaderPatched(name: string, value: string) {
        const nameS = latin1SafeString(name);
        const nameLower = nameS.toLowerCase();
        /** Alinhar a `cloneHeadersLatin1Safe`: JWT / chaves Supabase não passam por `sanitizeUserFreeText`. */
        const valueS =
          nameLower === "apikey" ||
          nameLower === "authorization" ||
          nameLower.startsWith("x-supabase-")
            ? latin1SafeString(stripInvisibleFormatting(String(value)))
            : sanitizeUserFreeText(String(value));
        return origSetRequestHeader.call(this, nameS, valueS);
      };

      const origSend = XP.send;
      XP.send = function sendPatched(body?: Document | XMLHttpRequestBodyInit | null) {
        if (typeof body === "string") {
          const enc = new TextEncoder().encode(body);
          const buf =
            enc.byteOffset === 0 && enc.byteLength === enc.buffer.byteLength
              ? enc.buffer
              : enc.slice().buffer;
          return origSend.call(this, buf);
        }
        return origSend.call(this, body ?? null);
      };
    }
  } catch {
    /* ignore */
  }
}
