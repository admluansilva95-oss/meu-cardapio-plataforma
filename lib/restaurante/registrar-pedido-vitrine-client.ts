import "@/lib/wire/bootstrap-byte-string-guard";
import { jsonStringifyLatin1Wire } from "@/lib/restaurante/json-latin1-wire";
import { buildVitrinePedidoWirePayload } from "@/lib/restaurante/vitrine-pedido-wire";
import { latin1SafeString } from "@/lib/utils/sanitize-strings";

export type VitrinePedidoJson = {
  ok?: boolean;
  error?: string;
  id?: string | null;
};

/**
 * Registra pedido da vitrine **somente via XMLHttpRequest** + corpo `ArrayBuffer` UTF-8.
 * Evita por completo o pipeline `fetch` do Chromium/Electron (fonte comum de `ByteString`).
 *
 * Usa `buildVitrinePedidoWirePayload` para não corromper UUIDs com `deepSanitizeStringsForWire`/`NFKC`.
 */
export function registrarPedidoVitrineNaApi(
  url: string,
  payload: unknown,
): Promise<{ status: number; json: VitrinePedidoJson }> {
  const wired = buildVitrinePedidoWirePayload(payload);
  const raw = jsonStringifyLatin1Wire(wired);
  const u8 = new TextEncoder().encode(raw);
  const bodyAb =
    u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength
      ? u8.buffer
      : u8.slice().buffer;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", latin1SafeString(url), true);
    xhr.setRequestHeader("Content-Type", "application/json; charset=utf-8");
    xhr.onload = () => {
      let json: VitrinePedidoJson = {};
      try {
        json = xhr.responseText ? (JSON.parse(xhr.responseText) as VitrinePedidoJson) : {};
      } catch {
        json = {};
      }
      resolve({ status: xhr.status, json });
    };
    xhr.onerror = () => reject(new Error("Falha de rede ao registrar o pedido."));
    xhr.send(bodyAb);
  });
}
