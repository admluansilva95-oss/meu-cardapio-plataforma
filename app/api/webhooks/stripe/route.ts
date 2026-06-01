import { NextResponse } from "next/server";
import { headers } from "next/headers";
import type Stripe from "stripe";
import { dispatchStripeEvent } from "@/lib/billing/stripe-webhook";
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
    console.error("[webhook/stripe] missing stripe-signature header");
    return NextResponse.json({ error: "Assinatura ausente." }, { status: 400 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (err) {
    console.error("[webhook/stripe] read body:", err);
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      getStripeWebhookSecret()
    );
  } catch (err) {
    console.error("[webhook/stripe] constructEvent:", err);
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 400 });
  }

  let admin;
  try {
    admin = requireAdminSupabaseClient();
  } catch (err) {
    console.error("[webhook/stripe] admin client:", err);
    return NextResponse.json(
      { error: "Configuração do servidor incompleta." },
      { status: 500 }
    );
  }

  const stripe = getStripe();

  try {
    const result = await dispatchStripeEvent(stripe, admin, event);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[webhook/stripe] handler:", err);
    return NextResponse.json({ error: "Erro ao processar evento." }, { status: 500 });
  }
}
