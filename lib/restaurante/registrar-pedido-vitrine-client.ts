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
function parseResJson(res: Response): Promise<VitrinePedidoJson> {
  return res.json().catch(() => ({} as VitrinePedidoJson));
}

function postPedidoVitrineXhr(url: string, bodyUtf8: Uint8Array): Promise<{ status: number; json: VitrinePedidoJson }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
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
    xhr.onerror = () => reject(new Error("XHR falhou."));
    xhr.send(bodyUtf8);
  });
}

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

  const doFetch = async () => {
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
    return { status: res.status, json: await parseResJson(res) };
  };

  try {
    return await doFetch();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/ByteString|Latin-1|USVString/i.test(msg)) {
      return postPedidoVitrineXhr(url, u8);
    }
    throw e;
  }
}
