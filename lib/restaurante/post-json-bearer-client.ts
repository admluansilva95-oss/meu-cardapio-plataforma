import {
  deepSanitizeStringsForWire,
  jsonStringifyLatin1Wire,
  latin1SafeString,
} from "@/lib/restaurante/json-latin1-wire";
import { sanitizeUserFreeText } from "@/lib/utils/sanitize-strings";

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

  const { status, statusText, responseText } = await new Promise<{
    status: number;
    statusText: string;
    responseText: string;
  }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", "application/json; charset=utf-8");
    xhr.setRequestHeader("Authorization", `Bearer ${tokenSafe}`);
    xhr.onload = () => {
      resolve({
        status: xhr.status,
        statusText: xhr.statusText,
        responseText: xhr.responseText,
      });
    };
    xhr.onerror = () => reject(new TypeError("Falha de rede ao salvar."));
    xhr.send(bodyAb);
  });

  /* `ResponseInit.statusText` é ByteString (Latin-1). `xhr.statusText` pode vir com texto não-Latin-1. */
  const statusTextSafe = latin1SafeString(statusText) || "OK";

  return new Response(responseText, {
    status,
    statusText: statusTextSafe,
    headers: new Headers({
      "Content-Type": "application/json; charset=utf-8",
    }),
  });
}
