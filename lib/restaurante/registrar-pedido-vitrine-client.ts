import {
  deepSanitizeStringsForWire,
  jsonStringifyLatin1Wire,
} from "@/lib/restaurante/json-latin1-wire";

export type VitrinePedidoJson = {
  ok?: boolean;
  error?: string;
  id?: string | null;
};

/**
 * Registra pedido da vitrine com `fetch` nativo:
 * - `referrerPolicy: "no-referrer"` evita cabeçalho `Referer` com Unicode (ByteString em alguns runtimes).
 * - corpo como `ArrayBuffer` UTF-8 (evita tratar o JSON como USVString).
 */
export async function registrarPedidoVitrineNaApi(
  url: string,
  payload: unknown,
): Promise<{ status: number; json: VitrinePedidoJson }> {
  const wired = deepSanitizeStringsForWire(payload);
  const raw = jsonStringifyLatin1Wire(wired);
  const u8 = new TextEncoder().encode(raw);
  const body =
    u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength
      ? u8.buffer
      : u8.slice().buffer;

  const res = await globalThis.fetch(url, {
    method: "POST",
    mode: "same-origin",
    credentials: "same-origin",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body,
  });

  let json: VitrinePedidoJson = {};
  try {
    json = (await res.json()) as VitrinePedidoJson;
  } catch {
    json = {};
  }
  return { status: res.status, json };
}
