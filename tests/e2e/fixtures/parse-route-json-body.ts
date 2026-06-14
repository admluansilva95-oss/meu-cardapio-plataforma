import type { Route } from "@playwright/test";

/**
 * Corpo JSON de pedidos `fetch` (ex.: Supabase Auth) pode chegar como string ou buffer UTF-8
 * (Blob no cliente após `latin1SafeFetch`). `postDataJSON()` por vezes devolve `null` — aqui
 * normalizamos para um objeto para asserções nos testes.
 */
export function parseJsonBodyFromRouteRequest(route: Route): Record<string, unknown> {
  const req = route.request();
  const asJson = req.postDataJSON();
  if (asJson && typeof asJson === "object" && !Array.isArray(asJson)) {
    return asJson as Record<string, unknown>;
  }
  const raw = req.postData();
  if (raw) {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  const buf = req.postDataBuffer();
  if (buf?.length) {
    try {
      return JSON.parse(buf.toString("utf8")) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}
