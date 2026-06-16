import { fetchAppApiResilient, parseAppApiJsonResponse } from "@/lib/http/fetch-app-api";

type CardapioPayload = {
  restaurante: unknown;
  pratos: unknown[];
};

type CacheEntry = { data: CardapioPayload; fetchedAt: number };

/** Curto o suficiente para refletir alterações no painel (ex.: endereço de retirada) sem martelar a API. */
const STALE_MS = 12_000;
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
    const res = await fetchAppApiResilient(
      `/api/public/cardapio?slug=${encodeURIComponent(key)}`,
      { signal, cache: "no-store" },
    );
    const parsed = await parseAppApiJsonResponse<{
      error?: string;
      restaurante?: unknown;
      pratos?: unknown;
    }>(res);
    if (!parsed.ok) {
      throw new Error(parsed.userMessage);
    }
    const body = parsed.data;
    if (res.status < 200 || res.status >= 300) {
      throw new Error(
        (typeof body.error === "string" && body.error) || `Erro ${res.status}`,
      );
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
