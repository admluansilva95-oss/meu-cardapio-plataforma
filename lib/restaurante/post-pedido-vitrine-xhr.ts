import { jsonStringifyLatin1Wire } from "@/lib/restaurante/json-latin1-wire";

export type VitrinePedidoJson = {
  ok?: boolean;
  error?: string;
  id?: string | null;
};

/**
 * POST JSON para `/api/pedidos/vitrine` via `XMLHttpRequest` + corpo binário UTF-8.
 * Contorna `TypeError: ByteString` que alguns runtimes disparam com `fetch` + corpo/cabeçalhos.
 */
export function postPedidoVitrineViaXhr(
  url: string,
  payload: unknown,
): Promise<{ status: number; json: VitrinePedidoJson }> {
  const raw = jsonStringifyLatin1Wire(payload);
  const bytes = new TextEncoder().encode(raw);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", "application/json; charset=utf-8");
    xhr.onload = () => {
      let json: VitrinePedidoJson = {};
      try {
        json = (xhr.responseText ? JSON.parse(xhr.responseText) : {}) as VitrinePedidoJson;
      } catch {
        json = {};
      }
      resolve({ status: xhr.status, json });
    };
    xhr.onerror = () => reject(new Error("Falha de rede ao registrar o pedido."));
    xhr.send(bytes);
  });
}
