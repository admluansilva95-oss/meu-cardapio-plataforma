import {
  deepSanitizeStringsForWire,
  jsonStringifyLatin1Wire,
} from "@/lib/restaurante/json-latin1-wire";
import { httpReasonPhraseForStatus } from "@/lib/http/byte-string-http";
import { latin1SafeString, sanitizeUserFreeText } from "@/lib/utils/sanitize-strings";

/**
 * POST JSON com `Authorization: Bearer` **somente via XMLHttpRequest** + corpo `ArrayBuffer` UTF-8.
 * Evita `TypeError: ByteString` (ex.: U+2022 em cookies/referrer ou bugs do `fetch` no Electron/Chromium)
 * ao salvar configurações no painel.
 */
export async function postJsonComBearer(
  url: string,
  payload: unknown,
  bearerToken: string,
): Promise<Response> {
  const wired = deepSanitizeStringsForWire(payload);
  const raw = jsonStringifyLatin1Wire(wired);
  const u8 = new TextEncoder().encode(raw);
  const bodyAb =
    u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength
      ? u8.buffer
      : u8.slice().buffer;

  const tokenSafe = sanitizeUserFreeText(bearerToken.trim());
  /** Cabeçalhos XHR são ByteString — reforço extra além de `sanitizeUserFreeText`. */
  const authorizationLatin1 =
    latin1SafeString(`Bearer ${tokenSafe}`).trim() || "Bearer ";

  const { status, responseText } = await new Promise<{
    status: number;
    responseText: string;
  }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", "application/json; charset=utf-8");
    xhr.setRequestHeader("Authorization", authorizationLatin1);
    xhr.onload = () => {
      resolve({
        status: xhr.status,
        responseText: xhr.responseText,
      });
    };
    xhr.onerror = () => reject(new TypeError("Falha de rede ao salvar."));
    xhr.send(bodyAb);
  });

  /*
   * Corpo como bytes UTF-8 (Blob), não como string UTF-16: em alguns Chromium/Electron,
   * `new Response(string)` dispara ByteString se o JSON tiver `•` (U+2022) vindo do servidor.
   */
  const bodyOut = new Blob([new TextEncoder().encode(responseText)], {
    type: "application/json; charset=utf-8",
  });

  /* `ResponseInit.statusText` é ByteString: nunca repassar `xhr.statusText`. */
  return new Response(bodyOut, {
    status,
    statusText: httpReasonPhraseForStatus(status),
    headers: new Headers({
      "Content-Type": "application/json; charset=utf-8",
    }),
  });
}
