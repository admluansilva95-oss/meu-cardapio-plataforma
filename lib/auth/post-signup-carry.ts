/**
 * Estado mínimo pós-cadastro (plano + restaurante) embutido na URL em um único
 * parâmetro `ob`, para sobreviver à confirmação por e-mail em outro dispositivo.
 */
export type PostSignupCarryPayload = {
  priceId: string;
  slug: string;
  /** Legado (cadastro antigo); o nome público fica no painel de configuração. */
  restaurantName?: string;
  whatsapp?: string;
};

export function buildAssinarPathWithCarry(payload: PostSignupCarryPayload): string {
  const compact: Record<string, string> = {
    priceId: payload.priceId,
    slug: payload.slug,
  };
  if (payload.restaurantName?.trim()) {
    compact.restaurantName = payload.restaurantName.trim();
  }
  if (payload.whatsapp?.trim()) {
    compact.whatsapp = payload.whatsapp.trim();
  }
  const ob = encodeURIComponent(JSON.stringify(compact));
  return `/assinar?ob=${ob}`;
}

export function parseCarryFromObParam(ob: string | null): PostSignupCarryPayload | null {
  if (!ob?.trim()) return null;
  try {
    const raw = decodeURIComponent(ob);
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (typeof v.priceId !== "string" || typeof v.slug !== "string") {
      return null;
    }
    return {
      priceId: v.priceId,
      slug: v.slug,
      ...(typeof v.restaurantName === "string" ? { restaurantName: v.restaurantName } : {}),
      ...(typeof v.whatsapp === "string" && v.whatsapp.trim() ? { whatsapp: v.whatsapp } : {}),
    };
  } catch {
    return null;
  }
}
