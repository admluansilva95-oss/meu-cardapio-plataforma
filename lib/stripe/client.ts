import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

/**
 * Cliente Stripe server-side (Route Handlers, webhooks).
 * Nunca importe em componentes client.
 */
export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY não configurada.");
  }

  if (!stripeSingleton) {
    stripeSingleton = new Stripe(secretKey);
  }

  return stripeSingleton;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET não configurada.");
  }
  return secret;
}
