import type Stripe from "stripe";
import { PLANS } from "@/lib/plans";
import { getPublicAppUrl } from "@/lib/site-url";
import { isPlaceholderStripePriceId } from "@/lib/stripe/user-facing-errors";

const CONFIG_METADATA_KEY = "meu_cardapio_billing_portal";
const CONFIG_METADATA_VALUE = "v1";

let cachedConfigurationId: string | null = null;

type PortalProduct = { product: string; prices: string[] };

async function collectPlanProductsForPortal(stripe: Stripe): Promise<PortalProduct[]> {
  const priceIds = PLANS.map((plan) => plan.priceId).filter(
    (priceId) => !isPlaceholderStripePriceId(priceId),
  );
  if (priceIds.length === 0) return [];

  const byProduct = new Map<string, string[]>();
  for (const priceId of priceIds) {
    const price = await stripe.prices.retrieve(priceId);
    const productId = typeof price.product === "string" ? price.product : price.product.id;
    const prices = byProduct.get(productId) ?? [];
    if (!prices.includes(priceId)) prices.push(priceId);
    byProduct.set(productId, prices);
  }

  return Array.from(byProduct.entries()).map(([product, prices]) => ({
    product,
    prices,
  }));
}

function portalFeatures(products: PortalProduct[]) {
  return {
    subscription_update: {
      enabled: true,
      default_allowed_updates: ["price", "promotion_code"],
      proration_behavior: "create_prorations",
      products: products.length > 0 ? products : undefined,
    },
    subscription_cancel: {
      enabled: true,
      mode: "at_period_end",
    },
    payment_method_update: {
      enabled: true,
    },
    invoice_history: {
      enabled: true,
    },
  };
}

/**
 * Garante uma configuração do Customer Portal com troca de plano (Essencial ↔ Premium).
 * Usa `STRIPE_BILLING_PORTAL_CONFIGURATION_ID` quando definido; senão cria/atualiza via API.
 */
export async function resolveStripeBillingPortalConfigurationId(
  stripe: Stripe,
): Promise<string | null> {
  const fromEnv = process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID?.trim();
  if (fromEnv) return fromEnv;

  if (cachedConfigurationId) return cachedConfigurationId;

  const products = await collectPlanProductsForPortal(stripe);
  if (products.length === 0) {
    console.warn(
      "[billing/portal] Nenhum price Stripe válido em NEXT_PUBLIC_STRIPE_PRICE_* — portal usa config padrão do Dashboard.",
    );
    return null;
  }

  const features = portalFeatures(products) as Parameters<
    Stripe["billingPortal"]["configurations"]["create"]
  >[0]["features"];
  const returnUrl = `${getPublicAppUrl()}/admin`;

  const existing = await stripe.billingPortal.configurations.list({ limit: 20, active: true });
  const ours = existing.data.find(
    (config) => config.metadata?.[CONFIG_METADATA_KEY] === CONFIG_METADATA_VALUE,
  );

  if (ours?.id) {
    await stripe.billingPortal.configurations.update(ours.id, {
      features,
      default_return_url: returnUrl,
      business_profile: {
        headline: "Gerencie sua assinatura do Meu Cardápio",
      },
    });
    cachedConfigurationId = ours.id;
    return ours.id;
  }

  const created = await stripe.billingPortal.configurations.create({
    metadata: { [CONFIG_METADATA_KEY]: CONFIG_METADATA_VALUE },
    name: "Meu Cardápio — troca de plano",
    default_return_url: returnUrl,
    business_profile: {
      headline: "Gerencie sua assinatura do Meu Cardápio",
    },
    features,
  });

  cachedConfigurationId = created.id;
  return created.id;
}
