import { deepSanitizeStringsForWire } from "@/lib/restaurante/json-latin1-wire";
import { initJsonPost, latin1SafeFetch } from "@/lib/fetch-latin1-safe";

/**
 * POST JSON com `Authorization: Bearer` via `fetch` instrumentado (`latin1SafeFetch` + `initJsonPost`):
 * corpo em `Blob` UTF-8, cabeçalhos Latin-1, JSON sem bullet/Unicode problemático no wire.
 *
 * O caminho XMLHttpRequest + `new Response(...)` ainda podia disparar ByteString em alguns
 * Chromium/Electron (cookies automáticos, `Response`/pipeline interno).
 */
export async function postJsonComBearer(
  url: string,
  payload: unknown,
  bearerToken: string,
): Promise<Response> {
  const wired = deepSanitizeStringsForWire(payload);
  return latin1SafeFetch(url, initJsonPost(wired, bearerToken));
}
