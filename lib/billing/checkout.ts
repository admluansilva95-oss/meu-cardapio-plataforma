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
  /** Opcional — se omitido, o slug é definido depois no painel admin. */
  slug?: string;
  restaurantName?: string;
  whatsapp?: string;
  idempotencyKey?: string;
};

export type CreateSubscriptionCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string; status: number };

async function resolveCheckoutSlug(
  admin: SupabaseClient,
  userId: string,
  rawSlug?: string,
): Promise<{ ok: true; slug: string | null } | { ok: false; error: string; status: number }> {
  const normalized = normalizeSlugInput(rawSlug ?? "");
  if (normalized) {
    if (!isValidSlug(normalized)) {
      return {
        ok: false,
        error: "Slug inválido. Use letras minúsculas, números e hífens (mín. 3 caracteres).",
        status: 400,
      };
    }
    const available = await isSlugAvailable(admin, normalized, userId);
    if (!available) {
      return {
        ok: false,
        error: "Este endereço do cardápio já está em uso. Escolha outro slug.",
        status: 409,
      };
    }
    return { ok: true, slug: normalized };
  }

  const { data: existing, error } = await admin
    .from("restaurantes")
    .select("slug")
    .eq("owner_id", userId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[billing/checkout] select restaurante by owner:", error.message);
    return { ok: false, error: "Não foi possível verificar seu restaurante.", status: 500 };
  }

  if (existing?.slug && isValidSlug(existing.slug)) {
    return { ok: true, slug: existing.slug };
  }

  return { ok: true, slug: null };
}

/**
 * Valida dados e cria sessão Stripe Checkout (modo assinatura).
 * Não persiste restaurante nem assinatura — isso ocorre no webhook após pagamento.
 */
export async function createSubscriptionCheckoutSession(
  admin: SupabaseClient,
  input: CreateSubscriptionCheckoutInput,
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

  const slugResolved = await resolveCheckoutSlug(admin, input.userId, input.slug);
  if (!slugResolved.ok) {
    return slugResolved;
  }
  const slug = slugResolved.slug;

  const restaurantName = (input.restaurantName ?? "").trim() || slug || "Restaurante";
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
    restaurant_name: restaurantName,
    whatsapp,
    price_id: input.priceId,
  };
  if (slug) {
    metadata.slug = slug;
  }

  const subscriptionMetadata: Stripe.MetadataParam = {
    supabase_user_id: input.userId,
  };
  if (slug) {
    subscriptionMetadata.slug = slug;
  }

  try {
    const success = new URL("/admin", origin);
    success.searchParams.set("checkout", "success");
    success.searchParams.set("success", "true");
    const cancel = new URL("/assinar", origin);
    cancel.searchParams.set("canceled", "true");

    const idem =
      typeof input.idempotencyKey === "string" && input.idempotencyKey.trim().length > 0
        ? input.idempotencyKey.trim().slice(0, 255)
        : undefined;

    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        locale: "pt-BR",
        // Omite payment_method_types → Stripe usa os métodos ativos no Dashboard
        // (cartão, Apple Pay, Google Pay, etc.). Ver Settings → Payment methods.
        customer_email: input.userEmail,
        line_items: [{ price: input.priceId, quantity: 1 }],
        success_url: success.href,
        cancel_url: cancel.href,
        metadata,
        subscription_data: {
          metadata: subscriptionMetadata,
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
