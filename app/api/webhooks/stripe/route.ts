import { NextResponse } from "next/server";
import { headers } from "next/headers";
import type Stripe from "stripe";
import { dispatchStripeEvent } from "@/lib/billing/stripe-webhook";
import { logStructured } from "@/lib/logging/structured-log";
import { isStripeIdempotencyTableUnavailable } from "@/lib/stripe/webhook-idempotency-errors";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe/client";
import { requireAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Webhook Stripe → Supabase `assinaturas` + `restaurantes` (após pagamento).
 *
 * Produção:
 * 1. Dashboard Stripe → Developers → Webhooks → Add endpoint
 * 2. URL: https://seu-dominio.com/api/webhooks/stripe
 * 3. Eventos: checkout.session.completed, invoice.payment_succeeded,
 *    invoice.payment_failed, customer.subscription.updated, customer.subscription.deleted
 * 4. Copie o signing secret para STRIPE_WEBHOOK_SECRET
 * 5. Em `checkout.sessions.create`, envie metadata: supabase_user_id, slug, restaurant_name
 *
 * Local: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
 */
export async function POST(request: Request) {
  const signature = (await headers()).get("stripe-signature");

  if (!signature) {
    logStructured("error", "webhook.stripe.no_signature", {});
    return NextResponse.json({ error: "Assinatura ausente." }, { status: 400 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (err) {
    logStructured("error", "webhook.stripe.read_body", { message: String(err) });
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret());
  } catch (err) {
    logStructured("error", "webhook.stripe.construct_event", { message: String(err) });
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 400 });
  }

  let admin;
  try {
    admin = requireAdminSupabaseClient();
  } catch (err) {
    logStructured("error", "webhook.stripe.admin_client", { message: String(err) });
    return NextResponse.json({ error: "Configuração do servidor incompleta." }, { status: 500 });
  }

  const stripe = getStripe();

  try {
    const { error: idemErr } = await admin.from("stripe_processed_events").insert({
      event_id: event.id,
      event_type: event.type,
    });

    let reservedIdem = false;
    if (idemErr) {
      const msg = (idemErr.message ?? "").toLowerCase();
      if (idemErr.code === "23505" || msg.includes("duplicate")) {
        logStructured("warn", "webhook.stripe.duplicate_event", {
          eventId: event.id,
          eventType: event.type,
        });
        return NextResponse.json({ duplicate: true }, { status: 200 });
      }
      if (isStripeIdempotencyTableUnavailable(idemErr)) {
        logStructured("warn", "webhook.stripe.idempotency_table_unavailable", {
          eventId: event.id,
          eventType: event.type,
          code: idemErr.code,
          message: idemErr.message,
        });
      } else {
        logStructured("error", "webhook.stripe.idempotency_insert", {
          eventId: event.id,
          code: idemErr.code,
          message: idemErr.message,
        });
        return NextResponse.json({ error: "Falha ao registrar idempotência do evento." }, { status: 500 });
      }
    } else {
      reservedIdem = true;
    }

    try {
      const result = await dispatchStripeEvent(stripe, admin, event);
      if (!result.ok) {
        if (reservedIdem) {
          const { error: delErr } = await admin
            .from("stripe_processed_events")
            .delete()
            .eq("event_id", event.id);
          if (delErr) {
            logStructured("error", "webhook.stripe.idempotency_rollback_failed", {
              eventId: event.id,
              message: delErr.message,
            });
          }
        }
        logStructured("error", "webhook.stripe.dispatch_failed", {
          eventId: event.id,
          eventType: event.type,
          error: result.error,
        });
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
      return NextResponse.json({ received: true });
    } catch (dispatchErr) {
      if (reservedIdem) {
        const { error: delErr } = await admin
          .from("stripe_processed_events")
          .delete()
          .eq("event_id", event.id);
        if (delErr) {
          logStructured("error", "webhook.stripe.idempotency_rollback_failed", {
            eventId: event.id,
            message: delErr.message,
          });
        }
      }
      throw dispatchErr;
    }
  } catch (err) {
    logStructured("error", "webhook.stripe.handler", {
      eventId: event.id,
      eventType: event.type,
      message: String(err),
    });
    return NextResponse.json({ error: "Erro ao processar evento." }, { status: 500 });
  }
}
