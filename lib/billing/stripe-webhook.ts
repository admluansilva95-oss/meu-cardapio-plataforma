import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { logStructured } from "@/lib/logging/structured-log";
import {
  buildPayloadFromSubscription,
  extractSubscriptionIdFromInvoice,
  findUserIdByStripeSubscriptionId,
  resolveStripeId,
  resolveSupabaseUserId,
  upsertAssinatura,
} from "@/lib/billing/assinaturas";
import { provisionRestauranteAfterPayment } from "@/lib/billing/restaurantes";
import { normalizeSlugInput } from "@/lib/billing/slug";

type DispatchResult = { ok: true } | { ok: false; error: string };

function metadataSlug(metadata: Stripe.Metadata | null | undefined): string | null {
  const raw = metadata?.slug?.trim();
  return raw ? normalizeSlugInput(raw) : null;
}

export async function handleCheckoutSessionCompleted(
  stripe: Stripe,
  admin: SupabaseClient,
  session: Stripe.Checkout.Session
): Promise<DispatchResult> {
  const userId = resolveSupabaseUserId(session.metadata);
  if (!userId) {
    logStructured("error", "webhook.stripe.checkout_no_user", {
      sessionId: session.id,
      eventType: "checkout.session.completed",
    });
    return { ok: true };
  }

  const subscriptionId = resolveStripeId(session.subscription);
  const customerId = resolveStripeId(session.customer);

  let subscription: Stripe.Subscription | null = null;
  if (subscriptionId) {
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  }

  const slug = metadataSlug(session.metadata) ?? metadataSlug(subscription?.metadata);
  if (!slug) {
    console.error("[webhook/stripe] slug ausente nos metadados", { sessionId: session.id });
    return { ok: false, error: "slug ausente nos metadados do checkout." };
  }

  const provision = await provisionRestauranteAfterPayment(admin, {
    user_id: userId,
    slug,
    restaurant_name: session.metadata?.restaurant_name,
    whatsapp: session.metadata?.whatsapp,
  });

  if (!provision.ok) {
    return { ok: false, error: provision.error };
  }

  const restauranteId = provision.restaurante_id;

  if (!subscriptionId) {
    const priceId = session.metadata?.price_id ?? null;
    const result = await upsertAssinatura(admin, {
      user_id: userId,
      stripe_customer_id: customerId,
      status: session.payment_status === "paid" ? "active" : "incomplete",
      price_id: priceId,
      restaurante_id: restauranteId,
    });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }

  const payload = buildPayloadFromSubscription(subscription!, userId);

  if (!payload.stripe_customer_id && customerId) {
    payload.stripe_customer_id = customerId;
  }
  if (!payload.price_id && session.metadata?.price_id) {
    payload.price_id = session.metadata.price_id;
  }
  payload.restaurante_id = restauranteId;

  const result = await upsertAssinatura(admin, payload);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function handleInvoicePaymentSucceeded(
  stripe: Stripe,
  admin: SupabaseClient,
  invoice: Stripe.Invoice
): Promise<DispatchResult> {
  const subscriptionId = extractSubscriptionIdFromInvoice(invoice);

  if (!subscriptionId) {
    return { ok: true };
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  let userId = resolveSupabaseUserId(subscription.metadata);

  if (!userId) {
    userId = await findUserIdByStripeSubscriptionId(admin, subscriptionId);
  }

  if (!userId) {
    console.error(
      "[webhook/stripe] invoice.payment_succeeded: user_id não resolvido",
      { subscriptionId, invoiceId: invoice.id }
    );
    return { ok: true };
  }

  const slug = metadataSlug(subscription.metadata);
  if (slug) {
    await provisionRestauranteAfterPayment(admin, {
      user_id: userId,
      slug,
      restaurant_name: subscription.metadata?.restaurant_name,
    });
  }

  const { data: restaurante } = slug
    ? await admin
        .from("restaurantes")
        .select("id")
        .eq("owner_id", userId)
        .eq("slug", slug)
        .maybeSingle()
    : { data: null };

  const payload = buildPayloadFromSubscription(subscription, userId);
  payload.restaurante_id = restaurante?.id ?? null;

  if (subscription.status === "active" || subscription.status === "trialing") {
    payload.status = subscription.status;
  }

  const result = await upsertAssinatura(admin, payload);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/**
 * Falha de cobrança na fatura: sincroniza `assinaturas` para `past_due` / `unpaid`
 * (ou outro status retornado pelo Stripe), para o proxy bloquear `/admin` quando aplicável.
 */
export async function handleInvoicePaymentFailed(
  stripe: Stripe,
  admin: SupabaseClient,
  invoice: Stripe.Invoice
): Promise<DispatchResult> {
  const subscriptionId = extractSubscriptionIdFromInvoice(invoice);

  if (!subscriptionId) {
    return { ok: true };
  }

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (err) {
    console.error(
      "[webhook/stripe] invoice.payment_failed: retrieve subscription",
      { subscriptionId, invoiceId: invoice.id, err },
    );
    const { data: row, error: selErr } = await admin
      .from("assinaturas")
      .select("id")
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle();

    if (selErr) {
      console.error("[webhook/stripe] invoice.payment_failed: select assinaturas", selErr.message);
      return { ok: false, error: selErr.message };
    }
    if (!row) {
      return { ok: true };
    }

    const { error: updErr } = await admin
      .from("assinaturas")
      .update({ status: "past_due" })
      .eq("id", row.id);

    if (updErr) {
      console.error("[webhook/stripe] invoice.payment_failed: update status", updErr.message);
      return { ok: false, error: updErr.message };
    }
    return { ok: true };
  }

  let userId = resolveSupabaseUserId(subscription.metadata);
  if (!userId) {
    userId = await findUserIdByStripeSubscriptionId(admin, subscriptionId);
  }

  if (!userId) {
    console.error(
      "[webhook/stripe] invoice.payment_failed: user_id não resolvido",
      { subscriptionId, invoiceId: invoice.id },
    );
    return { ok: true };
  }

  const payload = buildPayloadFromSubscription(subscription, userId);
  if (payload.status === "active" || payload.status === "trialing") {
    payload.status = "past_due";
  }

  const result = await upsertAssinatura(admin, payload);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function handleSubscriptionUpdated(
  stripe: Stripe,
  admin: SupabaseClient,
  subscription: Stripe.Subscription
): Promise<DispatchResult> {
  void stripe;

  let userId = resolveSupabaseUserId(subscription.metadata);
  if (!userId) {
    userId = await findUserIdByStripeSubscriptionId(admin, subscription.id);
  }

  if (!userId) {
    console.error(
      "[webhook/stripe] customer.subscription.updated: user_id não resolvido",
      { subscriptionId: subscription.id }
    );
    return { ok: true };
  }

  const result = await upsertAssinatura(admin, buildPayloadFromSubscription(subscription, userId));
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function handleSubscriptionDeleted(
  admin: SupabaseClient,
  subscription: Stripe.Subscription
): Promise<DispatchResult> {
  let userId = resolveSupabaseUserId(subscription.metadata);
  if (!userId) {
    userId = await findUserIdByStripeSubscriptionId(admin, subscription.id);
  }

  if (!userId) {
    console.error(
      "[webhook/stripe] customer.subscription.deleted: user_id não resolvido",
      { subscriptionId: subscription.id }
    );
    return { ok: true };
  }

  const payload = buildPayloadFromSubscription(subscription, userId);
  payload.status = "canceled";

  const result = await upsertAssinatura(admin, payload);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function dispatchStripeEvent(
  stripe: Stripe,
  admin: SupabaseClient,
  event: Stripe.Event,
): Promise<DispatchResult> {
  logStructured("info", "webhook.stripe.event", {
    eventId: event.id,
    eventType: event.type,
  });

  switch (event.type) {
    case "checkout.session.completed":
      return handleCheckoutSessionCompleted(
        stripe,
        admin,
        event.data.object as Stripe.Checkout.Session
      );

    case "invoice.payment_succeeded":
      return handleInvoicePaymentSucceeded(
        stripe,
        admin,
        event.data.object as Stripe.Invoice
      );

    case "invoice.payment_failed":
      return handleInvoicePaymentFailed(
        stripe,
        admin,
        event.data.object as Stripe.Invoice
      );

    case "customer.subscription.updated":
      return handleSubscriptionUpdated(
        stripe,
        admin,
        event.data.object as Stripe.Subscription
      );

    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(admin, event.data.object as Stripe.Subscription);

    default:
      return { ok: true };
  }
}
