export type StartCheckoutParams = {
  priceId: string;
  userId: string;
  accessToken: string;
  slug: string;
  restaurantName: string;
  whatsapp?: string;
};

export type StartCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Chama a API de checkout e retorna a URL do Stripe (uso no cliente após login/signup).
 */
export async function startSubscriptionCheckout(
  params: StartCheckoutParams
): Promise<StartCheckoutResult> {
  // Não validar o priceId aqui com `PLANS`/`getPlanByPriceId`: no cliente, os
  // NEXT_PUBLIC_* são fixados no build, enquanto o SSR usa o .env em runtime —
  // isso gerava "Plano inválido" falso-positivo. A rota `/api/checkout/create-session`
  // já valida o priceId no servidor.

  const response = await fetch("/api/checkout/create-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify({
      priceId: params.priceId,
      userId: params.userId,
      slug: params.slug,
      restaurantName: params.restaurantName,
      whatsapp: params.whatsapp,
    }),
  });

  const payload = (await response.json()) as { url?: string; error?: string };

  if (!response.ok) {
    return { ok: false, error: payload.error ?? "Falha ao iniciar o checkout." };
  }

  if (!payload.url) {
    return { ok: false, error: "Resposta inválida do servidor de pagamento." };
  }

  return { ok: true, url: payload.url };
}
