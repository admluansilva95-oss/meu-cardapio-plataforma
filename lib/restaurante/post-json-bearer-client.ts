import { deepSanitizeStringsForWire } from "@/lib/restaurante/json-latin1-wire";
import { initJsonPost, sanitizeFetchInit } from "@/lib/fetch-latin1-safe";
import { fetchAppApiResilient } from "@/lib/http/fetch-app-api";

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
  return fetchAppApiResilient(url, {
    appAuthCascade: true,
    ...sanitizeFetchInit(initJsonPost(wired, bearerToken)),
  });
}
