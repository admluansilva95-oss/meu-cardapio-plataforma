import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { getPlanByPriceId } from "@/lib/plans";
import { getStripe } from "@/lib/stripe/client";
import { isValidSlug, normalizeSlugInput } from "@/lib/billing/slug";
import { isSlugAvailable } from "@/lib/billing/restaurantes";
import { getPublicAppUrl } from "@/lib/site-url";

export type CreateSubscriptionCheckoutInput = {
  userId: string;
  userEmail: string | undefined;
  priceId: string;
  slug: string;
  restaurantName: string;
  whatsapp?: string;
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

  const restaurantName = input.restaurantName.trim() || slug;
  const whatsapp = input.whatsapp?.trim() ?? "";
  const appUrl = getPublicAppUrl();

  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch (err) {
    console.error("[billing/checkout] Stripe não configurado:", err);
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
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: input.userEmail,
      line_items: [{ price: input.priceId, quantity: 1 }],
      success_url: `${appUrl}/admin?checkout=success`,
      cancel_url: `${appUrl}/cadastro?priceId=${encodeURIComponent(input.priceId)}&canceled=1`,
      metadata,
      subscription_data: {
        metadata: {
          supabase_user_id: input.userId,
          slug,
        },
      },
    });

    if (!session.url) {
      return { ok: false, error: "Stripe não retornou URL de checkout.", status: 502 };
    }

    return { ok: true, url: session.url };
  } catch (err) {
    console.error("[billing/checkout] sessions.create:", err);
    return { ok: false, error: "Erro ao criar sessão de checkout no Stripe.", status: 500 };
  }
}
