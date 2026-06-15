import "@/lib/wire/bootstrap-byte-string-guard";
import { jsonStringifyLatin1Wire } from "@/lib/restaurante/json-latin1-wire";
import { buildVitrinePedidoWirePayload } from "@/lib/restaurante/vitrine-pedido-wire";
import { latin1SafeString } from "@/lib/utils/sanitize-strings";
import { newClientRequestId } from "@/lib/http/client-request-id";

export type VitrinePedidoJson = {
  ok?: boolean;
  error?: string;
  id?: string | null;
  duplicate?: boolean;
  requestId?: string;
};

const RETRY_STATUS = new Set([502, 503, 504]);
const MAX_ATTEMPTS = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(8000, 400 * 2 ** attempt);
}

function postOnce(
  url: string,
  bodyAb: ArrayBuffer,
  requestId: string,
  idempotencyKey: string,
): Promise<{ status: number; json: VitrinePedidoJson }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", latin1SafeString(url), true);
    xhr.setRequestHeader("Content-Type", "application/json; charset=utf-8");
    xhr.setRequestHeader("X-Request-ID", latin1SafeString(requestId).slice(0, 128));
    xhr.setRequestHeader("Idempotency-Key", latin1SafeString(idempotencyKey).slice(0, 128));
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

/**
 * Registra pedido da vitrine **somente via XMLHttpRequest** + corpo `ArrayBuffer` UTF-8.
 * Inclui `X-Request-ID`, `Idempotency-Key`, e retries com backoff em 502/503/504.
 */
export async function registrarPedidoVitrineNaApi(
  url: string,
  payload: unknown,
  opts?: { idempotencyKey?: string },
): Promise<{ status: number; json: VitrinePedidoJson }> {
  const wired = buildVitrinePedidoWirePayload(payload);
  const raw = jsonStringifyLatin1Wire(wired);
  const u8 = new TextEncoder().encode(raw);
  const bodyAb =
    u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength
      ? u8.buffer
      : u8.slice().buffer;

  const requestId = newClientRequestId();
  const idempotencyKey = opts?.idempotencyKey?.trim() || newClientRequestId();

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const out = await postOnce(url, bodyAb, requestId, idempotencyKey);
      if (RETRY_STATUS.has(out.status) && attempt < MAX_ATTEMPTS - 1) {
        await sleep(backoffMs(attempt));
        continue;
      }
      return out;
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Falha ao registrar o pedido.");
}
