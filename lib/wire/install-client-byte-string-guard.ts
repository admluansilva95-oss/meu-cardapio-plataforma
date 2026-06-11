import { createLatin1SafeFetch } from "@/lib/fetch-latin1-safe";
import { latin1SafeString, sanitizeUserFreeText } from "@/lib/utils/sanitize-strings";

declare global {
  interface Window {
    __BYTE_STRING_GUARD__?: true;
  }
}

function safeHeaderPair(name: string, value: string): readonly [string, string] {
  try {
    return [latin1SafeString(name), sanitizeUserFreeText(String(value))] as const;
  } catch {
    return [latin1SafeString(name), latin1SafeString(String(value))] as const;
  }
}

/**
 * Instala camadas defensivas contra `TypeError: ByteString` no cliente:
 * - `fetch` global → `createLatin1SafeFetch` (JSON/cabeçalhos/corpos já tratados).
 * - `XMLHttpRequest` (`open`, `setRequestHeader`, `send` com string).
 * - `Headers#set` / `#append` (SDKs que montam cabeçalhos diretamente).
 * - `document.cookie` (escrita via Latin-1 no wire).
 *
 * Deve correr o mais cedo possível — tipicamente via `instrumentation-client.ts`.
 */
export function installClientByteStringGuard(): void {
  if (typeof window === "undefined" || window.__BYTE_STRING_GUARD__) return;
  window.__BYTE_STRING_GUARD__ = true;

  try {
    const nativeFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = createLatin1SafeFetch(nativeFetch);
  } catch {
    /* ignore */
  }

  try {
    if (typeof Headers !== "undefined") {
      const P = Headers.prototype;
      const origSet = P.set;
      const origAppend = P.append;
      P.set = function setPatched(name: string, value: string) {
        const [n, v] = safeHeaderPair(name, value);
        return origSet.call(this, n, v);
      };
      P.append = function appendPatched(name: string, value: string) {
        const [n, v] = safeHeaderPair(name, value);
        return origAppend.call(this, n, v);
      };
    }
  } catch {
    /* ignore */
  }

  try {
    if (typeof XMLHttpRequest !== "undefined") {
      const XP = XMLHttpRequest.prototype;
      const origOpen = XP.open;
      XP.open = function openPatched(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
        const u = typeof url === "string" ? latin1SafeString(url) : url;
        return (origOpen as (this: XMLHttpRequest, ...args: unknown[]) => void).apply(this, [method, u, ...rest]);
      };

      const origSetRequestHeader = XP.setRequestHeader;
      XP.setRequestHeader = function setRequestHeaderPatched(name: string, value: string) {
        const [n, v] = safeHeaderPair(name, value);
        return origSetRequestHeader.call(this, n, v);
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

  try {
    const protos: object[] = [];
    if (typeof HTMLDocument !== "undefined") {
      protos.push(HTMLDocument.prototype);
    }
    protos.push(Document.prototype);
    for (const proto of protos) {
      const d = Object.getOwnPropertyDescriptor(proto, "cookie");
      if (!d?.set) continue;
      const origSet = d.set;
      Object.defineProperty(proto, "cookie", {
        configurable: true,
        enumerable: d.enumerable,
        get: d.get,
        set(v: string) {
          origSet.call(this, latin1SafeString(v));
        },
      });
      break;
    }
  } catch {
    /* ignore */
  }
}
