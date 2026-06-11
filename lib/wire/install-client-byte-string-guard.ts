import { createLatin1SafeFetch } from "@/lib/fetch-latin1-safe";
import { latin1SafeString, sanitizeUserFreeText } from "@/lib/utils/sanitize-strings";

declare global {
  interface Window {
    __BYTE_STRING_GUARD__?: true;
  }
}

/**
 * Instala defesas mínimas contra `TypeError: ByteString` no cliente.
 *
 * Mantemos só o que é de baixo risco:
 * - `fetch` global → `createLatin1SafeFetch` (corpo/cabeçalhos já tratados em `sanitizeFetchInit`).
 * - `XMLHttpRequest` (`open` URL string, `setRequestHeader`, `send` com string → UTF-8 em `ArrayBuffer`).
 *
 * **Removido de propósito** (podia regressar ou partir integrações):
 * - monkey-patch de `Headers#set` / `#append` (chamadas internas do motor / extensões / SW);
 * - monkey-patch de `document.cookie` (sessão Supabase / chunks).
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
    if (typeof XMLHttpRequest !== "undefined") {
      const XP = XMLHttpRequest.prototype;
      const origOpen = XP.open;
      XP.open = function openPatched(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
        const u = typeof url === "string" ? latin1SafeString(url) : url;
        return (origOpen as (this: XMLHttpRequest, ...args: unknown[]) => void).apply(this, [method, u, ...rest]);
      };

      const origSetRequestHeader = XP.setRequestHeader;
      XP.setRequestHeader = function setRequestHeaderPatched(name: string, value: string) {
        const nameS = latin1SafeString(name);
        const valueS = sanitizeUserFreeText(String(value));
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
