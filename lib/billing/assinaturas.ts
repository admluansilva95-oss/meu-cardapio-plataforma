import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

/** Status aceitos pela constraint `assinaturas_status_check` no Postgres. */
const ALLOWED_STATUSES = new Set([
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]);

export type AssinaturaUpsertPayload = {
  user_id: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  status: string;
  price_id?: string | null;
  restaurante_id?: string | null;
};

export function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status
): string {
  if (ALLOWED_STATUSES.has(status)) {
    return status;
  }
  console.error("[billing/assinaturas] status Stripe desconhecido:", status);
  return "incomplete";
}

export function extractPriceIdFromSubscription(
  subscription: Stripe.Subscription
): string | null {
  const item = subscription.items.data[0];
  if (!item?.price) return null;
  return typeof item.price === "string" ? item.price : item.price.id;
}

export function resolveStripeId(
  value: string | { id: string } | null | undefined
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export function resolveSupabaseUserId(
  metadata: Stripe.Metadata | null | undefined
): string | null {
  const userId = metadata?.supabase_user_id?.trim();
  return userId || null;
}

/**
 * Upsert em `assinaturas` via service role (ignora RLS).
 * Prioridade: linha com mesmo `stripe_subscription_id`, senão a mais recente do `user_id`.
 */
export async function upsertAssinatura(
  admin: SupabaseClient,
  payload: AssinaturaUpsertPayload
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user_id, stripe_subscription_id } = payload;

  if (stripe_subscription_id) {
    const { data: bySubscription, error: selectSubError } = await admin
      .from("assinaturas")
      .select("id")
      .eq("stripe_subscription_id", stripe_subscription_id)
      .maybeSingle();

    if (selectSubError) {
      console.error("[billing/assinaturas] select by subscription:", selectSubError.message);
      return { ok: false, error: selectSubError.message };
    }

    if (bySubscription) {
      const { error: updateError } = await admin
        .from("assinaturas")
        .update({
          stripe_customer_id: payload.stripe_customer_id ?? null,
          status: payload.status,
          price_id: payload.price_id ?? null,
          ...(payload.restaurante_id != null
            ? { restaurante_id: payload.restaurante_id }
            : {}),
        })
        .eq("id", bySubscription.id);

      if (updateError) {
        console.error("[billing/assinaturas] update by subscription:", updateError.message);
        return { ok: false, error: updateError.message };
      }
      return { ok: true };
    }
  }

  const { data: byUser, error: selectUserError } = await admin
    .from("assinaturas")
    .select("id, stripe_subscription_id")
    .eq("user_id", user_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selectUserError) {
    console.error("[billing/assinaturas] select by user:", selectUserError.message);
    return { ok: false, error: selectUserError.message };
  }

  if (byUser && !byUser.stripe_subscription_id && stripe_subscription_id) {
    const { error: linkError } = await admin
      .from("assinaturas")
      .update({
        stripe_customer_id: payload.stripe_customer_id ?? null,
        stripe_subscription_id,
        status: payload.status,
        price_id: payload.price_id ?? null,
        ...(payload.restaurante_id != null
          ? { restaurante_id: payload.restaurante_id }
          : {}),
      })
      .eq("id", byUser.id);

    if (linkError) {
      console.error("[billing/assinaturas] link subscription to row:", linkError.message);
      return { ok: false, error: linkError.message };
    }
    return { ok: true };
  }

  if (byUser && byUser.stripe_subscription_id === stripe_subscription_id) {
    const { error: updateUserError } = await admin
      .from("assinaturas")
      .update({
        stripe_customer_id: payload.stripe_customer_id ?? null,
        status: payload.status,
        price_id: payload.price_id ?? null,
        ...(payload.restaurante_id != null
          ? { restaurante_id: payload.restaurante_id }
          : {}),
      })
      .eq("id", byUser.id);

    if (updateUserError) {
      console.error("[billing/assinaturas] update by user:", updateUserError.message);
      return { ok: false, error: updateUserError.message };
    }
    return { ok: true };
  }

  const { error: insertError } = await admin.from("assinaturas").insert({
    user_id,
    stripe_customer_id: payload.stripe_customer_id ?? null,
    stripe_subscription_id: stripe_subscription_id ?? null,
    status: payload.status,
    price_id: payload.price_id ?? null,
    restaurante_id: payload.restaurante_id ?? null,
  });

  if (insertError) {
    console.error("[billing/assinaturas] insert:", insertError.message);
    return { ok: false, error: insertError.message };
  }

  return { ok: true };
}

export async function findUserIdByStripeSubscriptionId(
  admin: SupabaseClient,
  stripeSubscriptionId: string
): Promise<string | null> {
  const { data, error } = await admin
    .from("assinaturas")
    .select("user_id")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();

  if (error) {
    console.error("[billing/assinaturas] find user by subscription:", error.message);
    return null;
  }

  return data?.user_id ?? null;
}

/**
 * Stripe Billing (API recente): assinatura em `invoice.parent.subscription_details`.
 */
export function extractSubscriptionIdFromInvoice(
  invoice: Stripe.Invoice
): string | null {
  const fromParent = invoice.parent?.subscription_details?.subscription;
  if (fromParent) {
    return resolveStripeId(fromParent);
  }

  const legacy = (
    invoice as Stripe.Invoice & {
      subscription?: string | Stripe.Subscription | null;
    }
  ).subscription;

  return resolveStripeId(legacy ?? undefined);
}

export function buildPayloadFromSubscription(
  subscription: Stripe.Subscription,
  userId: string
): AssinaturaUpsertPayload {
  return {
    user_id: userId,
    stripe_customer_id: resolveStripeId(subscription.customer),
    stripe_subscription_id: subscription.id,
    status: mapStripeSubscriptionStatus(subscription.status),
    price_id: extractPriceIdFromSubscription(subscription),
  };
}
