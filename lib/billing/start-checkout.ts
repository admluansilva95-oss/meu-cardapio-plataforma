import { initJsonPost, sanitizeFetchInit, cloneHeadersLatin1Safe } from "@/lib/fetch-latin1-safe";
import { fetchAppApiResilient } from "@/lib/http/fetch-app-api";
import { newClientRequestId } from "@/lib/http/client-request-id";
import { latin1SafeString } from "@/lib/utils/sanitize-strings";

export type StartCheckoutParams = {
  priceId: string;
  userId: string;
  accessToken: string;
  slug: string;
  restaurantName?: string;
  whatsapp?: string;
  /** Opcional; por defeito gera-se uma chave por tentativa de checkout. */
  idempotencyKey?: string;
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

  const idempotencyKey = params.idempotencyKey?.trim() || newClientRequestId();

  const controller = new AbortController();
  const timeoutMs = 45_000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const baseInit = initJsonPost(
    {
      priceId: params.priceId,
      userId: params.userId,
      slug: params.slug,
      restaurantName: params.restaurantName,
      whatsapp: params.whatsapp,
    },
    params.accessToken,
  );
  const headers = cloneHeadersLatin1Safe(baseInit.headers ?? undefined);
  headers.set("Idempotency-Key", latin1SafeString(idempotencyKey).slice(0, 255));

  let response: Response;
  try {
    response = await fetchAppApiResilient(
      "/api/checkout/create-session",
      sanitizeFetchInit({
        ...baseInit,
        headers,
        signal: controller.signal,
      }),
    );
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        ok: false,
        error: "O servidor demorou demais a responder. Atualize a página e tente de novo.",
      };
    }
    return {
      ok: false,
      error: "Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.",
    };
  }
  clearTimeout(timeoutId);

  const payload = (await response.json()) as { url?: string; error?: string };

  if (!response.ok) {
    return { ok: false, error: payload.error ?? "Falha ao iniciar o checkout." };
  }

  if (!payload.url) {
    return { ok: false, error: "Resposta inválida do servidor de pagamento." };
  }

  return { ok: true, url: payload.url };
}
