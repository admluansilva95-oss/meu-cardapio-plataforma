import type { CookieOptions } from "@supabase/ssr";
import { latin1SafeString } from "@/lib/utils/sanitize-strings";

/**
 * Camada HTTP (reason phrase, `Set-Cookie`, alguns cabeçalhos) exige **ByteString / Latin-1**.
 * Mensagens com `•` (U+2022) ou Unicode devem ir **apenas** no corpo JSON — nunca em `statusText`
 * nem em valores de cookie no wire.
 */

/** Frases canônicas ASCII (RFC 9110 / compatível com runtimes estritos). */
const REASON_PHRASES: Record<number, string> = {
  100: "Continue",
  101: "Switching Protocols",
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  303: "See Other",
  304: "Not Modified",
  307: "Temporary Redirect",
  308: "Permanent Redirect",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  409: "Conflict",
  413: "Payload Too Large",
  415: "Unsupported Media Type",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

function fallbackReasonPhrase(code: number): string {
  if (code >= 100 && code < 200) return "Continue";
  if (code >= 200 && code < 300) return "OK";
  if (code >= 300 && code < 400) return "Found";
  if (code >= 400 && code < 500) return "Bad Request";
  if (code >= 500 && code < 600) return "Internal Server Error";
  return "Internal Server Error";
}

/**
 * Texto seguro para `ResponseInit.statusText`: só ASCII fixo por status.
 * Nunca repasse `xhr.statusText` nem mensagens de erro do servidor — podem começar com `•`.
 */
export function httpReasonPhraseForStatus(status: number): string {
  const code = Math.trunc(Number(status));
  if (!Number.isFinite(code) || code < 100 || code > 599) {
    return "Internal Server Error";
  }
  return REASON_PHRASES[code] ?? fallbackReasonPhrase(code);
}

export type CookieWireWrite = { name: string; value: string; options: CookieOptions };

/** Normaliza nome/valor de cookie para Latin-1 no wire (`Set-Cookie`). */
export function latin1CookieWrite(w: CookieWireWrite): CookieWireWrite {
  return {
    name: latin1SafeString(w.name),
    value: latin1SafeString(w.value),
    options: w.options,
  };
}
