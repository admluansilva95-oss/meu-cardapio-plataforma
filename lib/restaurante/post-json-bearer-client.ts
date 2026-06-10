import { deepSanitizeStringsForWire, jsonStringifyLatin1Wire } from "@/lib/restaurante/json-latin1-wire";

/**
 * POST JSON com `Authorization: Bearer` — `fetch` nativo, corpo `ArrayBuffer` UTF-8,
 * `referrerPolicy: no-referrer` (evita `ByteString` em alguns runtimes ao salvar config).
 */
export async function postJsonComBearer(
  url: string,
  payload: unknown,
  bearerToken: string,
): Promise<Response> {
  const wired = deepSanitizeStringsForWire(payload);
  const raw = jsonStringifyLatin1Wire(wired);
  const u8 = new TextEncoder().encode(raw);
  const body =
    u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength
      ? u8.buffer
      : u8.slice().buffer;

  return globalThis.fetch(url, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${bearerToken}`,
    },
    body,
  });
}
