import { getNativeHeaders } from "@/lib/http/native-http-constructors";

/**
 * PostgREST (`/rest/v1`) exige `Content-Type: application/json` para corpos JSON em string.
 * Se o cabeçalho faltar, o browser envia `text/plain` → erro "Content-Type not acceptable: text/plain".
 *
 * Não altera pedidos com `FormData` / `Blob` (ex.: upload no Storage — boundary multipart).
 */
export function wrapFetchEnsureSupabaseWireSafe(base: typeof fetch): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (init == null) return base(input, init);

    const urlStr =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : typeof Request !== "undefined" && input instanceof Request
            ? input.url
            : "";
    if (!urlStr.includes("/rest/v1")) return base(input, init);

    const { body, method = "GET" } = init;
    if (typeof body !== "string" || body.length === 0) return base(input, init);

    const m = method.toUpperCase();
    if (m === "GET" || m === "HEAD") return base(input, init);

    const trimmed = body.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return base(input, init);

    const H = getNativeHeaders();
    const h = new H(init.headers as HeadersInit | undefined);
    const ct = (h.get("content-type") ?? "").toLowerCase();
    if (!ct || ct.startsWith("text/plain")) {
      h.set("Content-Type", "application/json");
      return base(input, { ...init, headers: h });
    }
    return base(input, init);
  };
}
