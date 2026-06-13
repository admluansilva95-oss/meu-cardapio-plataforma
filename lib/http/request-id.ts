export const REQUEST_ID_HEADER = "X-Request-ID";

const SAFE_ID = /^[a-zA-Z0-9._-]{8,128}$/;

function newServerRequestId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `srid-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Reutiliza o ID enviado pelo cliente ou gera um novo (UUID).
 * IDs inválidos são descartados para evitar injeção em logs / JSON.
 */
export function getOrCreateRequestId(request: Request): string {
  const raw = request.headers.get(REQUEST_ID_HEADER)?.trim();
  if (raw && SAFE_ID.test(raw)) return raw;
  return newServerRequestId();
}
