/**
 * Estado mínimo pós-cadastro (plano + opcionais) embutido na URL em um único
 * parâmetro `ob`, para sobreviver à confirmação por e-mail em outro dispositivo.
 */
export type PostSignupCarryPayload = {
  priceId: string;
  /** Legado — slug agora é definido no painel admin após pagamento. */
  slug?: string;
  restaurantName?: string;
  whatsapp?: string;
};

export function buildAssinarPathWithCarry(payload: PostSignupCarryPayload): string {
  const compact: Record<string, string> = {
    priceId: payload.priceId,
  };
  if (payload.slug?.trim()) {
    compact.slug = payload.slug.trim();
  }
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
    if (typeof v.priceId !== "string") {
      return null;
    }
    return {
      priceId: v.priceId,
      ...(typeof v.slug === "string" && v.slug.trim() ? { slug: v.slug.trim() } : {}),
      ...(typeof v.restaurantName === "string" ? { restaurantName: v.restaurantName } : {}),
      ...(typeof v.whatsapp === "string" && v.whatsapp.trim() ? { whatsapp: v.whatsapp } : {}),
    };
  } catch {
    return null;
  }
}
