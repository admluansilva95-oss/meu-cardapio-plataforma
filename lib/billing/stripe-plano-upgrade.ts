import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import {
  extractPriceIdFromSubscription,
  extractSubscriptionIdFromInvoice,
  resolveStripeId,
} from "@/lib/billing/assinaturas";
import { getPlanByPriceId, type PlanId } from "@/lib/plans";
import { logStructured } from "@/lib/logging/structured-log";

export type StripePlanoUpgradeSyncResult =
  | { ok: true; restauranteId: string | null; planId: PlanId | null; skipped: boolean }
  | { ok: false; error: string };

type RestauranteLookup = {
  restauranteId: string | null;
  userId: string | null;
};

async function buscarRestaurantePorStripeCustomerId(
  admin: SupabaseClient,
  stripeCustomerId: string,
): Promise<RestauranteLookup> {
  const { data: assinatura, error: assinErr } = await admin
    .from("assinaturas")
    .select("user_id, restaurante_id")
    .eq("stripe_customer_id", stripeCustomerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (assinErr) {
    logStructured("warn", "billing.stripe_upgrade.assinatura_lookup_failed", {
      stripeCustomerId,
      code: assinErr.code ?? null,
    });
    return { restauranteId: null, userId: null };
  }

  if (assinatura?.restaurante_id) {
    return {
      restauranteId: assinatura.restaurante_id,
      userId: assinatura.user_id ?? null,
    };
  }

  const userId = assinatura?.user_id ?? null;
  if (!userId) {
    return { restauranteId: null, userId: null };
  }

  const { data: restaurante, error: restErr } = await admin
    .from("restaurantes")
    .select("id")
    .eq("owner_id", userId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (restErr) {
    logStructured("warn", "billing.stripe_upgrade.restaurante_lookup_failed", {
      stripeCustomerId,
      userId,
      code: restErr.code ?? null,
    });
    return { restauranteId: null, userId };
  }

  return { restauranteId: restaurante?.id ?? null, userId };
}

/**
 * Sincroniza o plano do tenant após upgrade/downgrade no Stripe.
 * Atualiza `restaurantes.plano_id` para que `avaliarLimitePedidosMensal` reflita Premium → sem_limite.
 * Não substitui `upsertAssinatura` — chame depois do fluxo existente de assinatura.
 */
export async function sincronizarPlanoUpgradeStripe(
  admin: SupabaseClient,
  input: {
    stripeCustomerId: string | null | undefined;
    priceId: string | null | undefined;
  },
): Promise<StripePlanoUpgradeSyncResult> {
  const stripeCustomerId = input.stripeCustomerId?.trim() ?? "";
  const priceId = input.priceId?.trim() ?? "";

  if (!stripeCustomerId || !priceId) {
    return { ok: true, restauranteId: null, planId: null, skipped: true };
  }

  const plan = getPlanByPriceId(priceId);
  if (!plan) {
    logStructured("warn", "billing.stripe_upgrade.price_id_unknown", {
      stripeCustomerId,
      priceId,
    });
    return { ok: true, restauranteId: null, planId: null, skipped: true };
  }

  const { restauranteId } = await buscarRestaurantePorStripeCustomerId(admin, stripeCustomerId);
  if (!restauranteId) {
    logStructured("warn", "billing.stripe_upgrade.restaurante_not_found", {
      stripeCustomerId,
      planId: plan.id,
    });
    return { ok: true, restauranteId: null, planId: plan.id, skipped: true };
  }

  const { error: assinUpdateErr } = await admin
    .from("assinaturas")
    .update({ price_id: priceId })
    .eq("stripe_customer_id", stripeCustomerId);

  if (assinUpdateErr) {
    logStructured("error", "billing.stripe_upgrade.assinatura_price_update_failed", {
      stripeCustomerId,
      priceId,
      code: assinUpdateErr.code ?? null,
      message: assinUpdateErr.message,
    });
    return { ok: false, error: assinUpdateErr.message };
  }

  const { error: updateErr } = await admin
    .from("restaurantes")
    .update({ plano_id: plan.id })
    .eq("id", restauranteId);

  if (updateErr) {
    logStructured("error", "billing.stripe_upgrade.restaurante_update_failed", {
      restauranteId,
      planId: plan.id,
      code: updateErr.code ?? null,
      message: updateErr.message,
    });
    return { ok: false, error: updateErr.message };
  }

  logStructured("info", "billing.stripe_upgrade.synced", {
    restauranteId,
    planId: plan.id,
    stripeCustomerId,
    pedidosIlimitados: plan.monthlyOrderLimit == null,
  });

  return { ok: true, restauranteId, planId: plan.id, skipped: false };
}

export async function sincronizarPlanoUpgradeFromSubscription(
  admin: SupabaseClient,
  subscription: Stripe.Subscription,
): Promise<StripePlanoUpgradeSyncResult> {
  return sincronizarPlanoUpgradeStripe(admin, {
    stripeCustomerId: resolveStripeId(subscription.customer),
    priceId: extractPriceIdFromSubscription(subscription),
  });
}

export async function sincronizarPlanoUpgradeFromInvoice(
  admin: SupabaseClient,
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<StripePlanoUpgradeSyncResult> {
  const subscriptionId = extractSubscriptionIdFromInvoice(invoice);
  if (subscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      return sincronizarPlanoUpgradeFromSubscription(admin, subscription);
    } catch (err) {
      logStructured("warn", "billing.stripe_upgrade.invoice_subscription_retrieve_failed", {
        invoiceId: invoice.id,
        subscriptionId,
        errName: err instanceof Error ? err.name : "unknown",
      });
    }
  }

  const customerId = resolveStripeId(invoice.customer);
  return sincronizarPlanoUpgradeStripe(admin, {
    stripeCustomerId: customerId,
    priceId: null,
  });
}
