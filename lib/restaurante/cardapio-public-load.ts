import { xhrGetJson } from "@/lib/restaurante/xhr-get-json-client";

type CardapioPayload = {
  restaurante: unknown;
  pratos: unknown[];
};

type CacheEntry = { data: CardapioPayload; fetchedAt: number };

const STALE_MS = 45_000;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CardapioPayload>>();

/**
 * Uma requisição em voo por `slug` + SWR em memória (evita rajadas ao trocar aba / re-render).
 */
export function fetchPublicCardapioDeduped(slug: string, signal?: AbortSignal): Promise<CardapioPayload> {
  const key = slug.trim().toLowerCase();
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.fetchedAt < STALE_MS) {
    return Promise.resolve(hit.data);
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const p = (async () => {
    const { status, json } = await xhrGetJson(
      `/api/public/cardapio?slug=${encodeURIComponent(key)}`,
      signal,
    );
    const body = json as { error?: string; restaurante?: unknown; pratos?: unknown };
    if (status < 200 || status >= 300) {
      throw new Error(body.error ?? `Erro ${status}`);
    }
    const data: CardapioPayload = {
      restaurante: body.restaurante ?? null,
      pratos: Array.isArray(body.pratos) ? body.pratos : [],
    };
    cache.set(key, { data, fetchedAt: Date.now() });
    return data;
  })();

  inflight.set(key, p);
  void p.finally(() => inflight.delete(key));
  return p;
}

export function invalidatePublicCardapioCache(slug: string): void {
  cache.delete(slug.trim().toLowerCase());
}
