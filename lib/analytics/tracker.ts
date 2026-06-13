import { isValidSlug } from "@/lib/billing/slug";

const ANALYTICS_URL = "/api/analytics";

const EVENTS = {
  vitrineVisualizada: "vitrine.visualizada",
  itemAdicionado: "vitrine.item_adicionado",
  checkoutIniciado: "vitrine.checkout_iniciado",
  pedidoConcluido: "vitrine.pedido_concluido",
} as const;

type BeaconPayload = {
  event: string;
  slug?: string;
  pratoId?: string;
  pedidoId?: string | null;
  ts: number;
};

function safeSlug(slug: string): string | null {
  const t = slug.trim();
  if (!t || !isValidSlug(t)) return null;
  return t;
}

function dispatchAnalytics(payload: BeaconPayload): void {
  const body = JSON.stringify(payload);
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const ok = navigator.sendBeacon(
        ANALYTICS_URL,
        new Blob([body], { type: "application/json; charset=utf-8" }),
      );
      if (ok) return;
    } catch {
      /* fallback */
    }
  }
  try {
    void fetch(ANALYTICS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      mode: "same-origin",
    });
  } catch {
    /* ignore */
  }
}

function schedule(fn: () => void): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(() => {
      try {
        fn();
      } finally {
        resolve();
      }
    });
  });
}

/** Cardápio público carregado com sucesso (uma vez por sessão de página / slug). */
export async function trackVitrineVisualizada(slug: string): Promise<void> {
  const s = safeSlug(slug);
  if (!s) return schedule(() => {});
  return schedule(() =>
    dispatchAnalytics({ event: EVENTS.vitrineVisualizada, slug: s, ts: Date.now() }),
  );
}

export async function trackItemAdicionado(slug: string, pratoId: string): Promise<void> {
  const s = safeSlug(slug);
  const pid = typeof pratoId === "string" ? pratoId.trim() : "";
  if (!s || !pid) return schedule(() => {});
  return schedule(() =>
    dispatchAnalytics({
      event: EVENTS.itemAdicionado,
      slug: s,
      pratoId: pid,
      ts: Date.now(),
    }),
  );
}

/** Usuário abriu o fluxo de sacola/checkout (drawer). */
export async function trackCheckoutIniciado(slug: string): Promise<void> {
  const s = safeSlug(slug);
  if (!s) return schedule(() => {});
  return schedule(() =>
    dispatchAnalytics({ event: EVENTS.checkoutIniciado, slug: s, ts: Date.now() }),
  );
}

/** Pedido registrado na API antes do envio ao WhatsApp. */
export async function trackPedidoConcluido(slug: string, pedidoId?: string | null): Promise<void> {
  const s = safeSlug(slug);
  if (!s) return schedule(() => {});
  const pid = typeof pedidoId === "string" ? pedidoId.trim() : null;
  return schedule(() =>
    dispatchAnalytics({
      event: EVENTS.pedidoConcluido,
      slug: s,
      pedidoId: pid || undefined,
      ts: Date.now(),
    }),
  );
}
