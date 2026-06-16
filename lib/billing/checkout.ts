import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { getPlanByPriceId } from "@/lib/plans";
import { logStructured } from "@/lib/logging/structured-log";
import { getStripe } from "@/lib/stripe/client";
import { isValidSlug, normalizeSlugInput } from "@/lib/billing/slug";
import { isSlugAvailable } from "@/lib/billing/restaurantes";
import { resolveStripeCheckoutOrigin } from "@/lib/site-url";
import {
  isPlaceholderStripePriceId,
  mapStripeErrorForUser,
  stripeKeyModeLabel,
} from "@/lib/stripe/user-facing-errors";

export type CreateSubscriptionCheckoutInput = {
  userId: string;
  userEmail: string | undefined;
  priceId: string;
  slug: string;
  /** Opcional; se vazio, o Stripe/metadata usam o slug (nome no painel depois). */
  restaurantName?: string;
  whatsapp?: string;
  /** Idempotência Stripe (rede instável / duplo clique). */
  idempotencyKey?: string;
};

export type CreateSubscriptionCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string; status: number };

/**
 * Valida dados e cria sessão Stripe Checkout (modo assinatura).
 * Não persiste restaurante nem assinatura — isso ocorre no webhook após pagamento.
 */
export async function createSubscriptionCheckoutSession(
  admin: SupabaseClient,
  input: CreateSubscriptionCheckoutInput
): Promise<CreateSubscriptionCheckoutResult> {
  const plan = getPlanByPriceId(input.priceId);
  if (!plan) {
    return { ok: false, error: "Plano inválido para o priceId informado.", status: 400 };
  }

  if (isPlaceholderStripePriceId(input.priceId)) {
    return {
      ok: false,
      error:
        "Price ID do Stripe não configurado. Defina NEXT_PUBLIC_STRIPE_PRICE_ESSENCIAL e " +
        "NEXT_PUBLIC_STRIPE_PRICE_PREMIUM na Vercel (ou .env.local) com os IDs price_… do Dashboard.",
      status: 503,
    };
  }

  const slug = normalizeSlugInput(input.slug);
  if (!isValidSlug(slug)) {
    return {
      ok: false,
      error: "Slug inválido. Use letras minúsculas, números e hífens (mín. 3 caracteres).",
      status: 400,
    };
  }

  const available = await isSlugAvailable(admin, slug, input.userId);
  if (!available) {
    return { ok: false, error: "Este endereço do cardápio já está em uso. Escolha outro slug.", status: 409 };
  }

  const restaurantName = (input.restaurantName ?? "").trim() || slug;
  const whatsapp = input.whatsapp?.trim() ?? "";

  const origin = resolveStripeCheckoutOrigin();

  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch (err) {
    logStructured("error", "billing.checkout.stripe_missing", {
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      error: "Pagamentos indisponíveis no momento. Configure STRIPE_SECRET_KEY.",
      status: 503,
    };
  }

  const metadata: Stripe.MetadataParam = {
    supabase_user_id: input.userId,
    slug,
    restaurant_name: restaurantName,
    whatsapp,
    price_id: input.priceId,
  };

  try {
    const success = new URL("/admin", origin);
    success.searchParams.set("checkout", "success");
    success.searchParams.set("success", "true");
    const cancel = new URL("/assinar", origin);
    cancel.searchParams.set("canceled", "true");

    const success_url = success.href;
    const cancel_url = cancel.href;

    const idem =
      typeof input.idempotencyKey === "string" && input.idempotencyKey.trim().length > 0
        ? input.idempotencyKey.trim().slice(0, 255)
        : undefined;

    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        locale: "pt-BR",
        customer_email: input.userEmail,
        line_items: [{ price: input.priceId, quantity: 1 }],
        success_url,
        cancel_url,
        metadata,
        subscription_data: {
          metadata: {
            supabase_user_id: input.userId,
            slug,
          },
        },
      },
      idem ? { idempotencyKey: idem } : undefined,
    );

    if (!session.url) {
      return { ok: false, error: "Stripe não retornou URL de checkout.", status: 502 };
    }

    return { ok: true, url: session.url };
  } catch (err) {
    logStructured("error", "billing.checkout.sessions_create", {
      message: err instanceof Error ? err.message : String(err),
      code:
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: unknown }).code)
          : null,
      stripeMode: stripeKeyModeLabel(),
      priceId: input.priceId,
    });
    return {
      ok: false,
      error: mapStripeErrorForUser(err, "checkout"),
      status: 500,
    };
  }
}
