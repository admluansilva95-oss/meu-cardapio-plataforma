export type PlanId = "essencial" | "premium";

export type Plan = {
  id: PlanId;
  name: string;
  description: string;
  priceLabel: string;
  priceCents: number;
  priceId: string;
  features: string[];
  highlighted?: boolean;
  /**
   * Limite de pedidos por mês (janela calendário) para comunicação e futura cobrança no app.
   * `null` = sem limite declarado (plano superior).
   */
  monthlyOrderLimit: number | null;
};

const envPrice = (key: string, fallback: string) =>
  process.env[key]?.trim() || fallback;

/** Teto de pedidos/mês do Essencial (única fonte para copy e regra no app). */
export const ESSENCIAL_MONTHLY_ORDER_LIMIT = 150;

/** Percentual do limite em que o painel exibe aviso (80% = 120 pedidos em 150). */
export const ESSENCIAL_PEDIDOS_AVISO_PERCENT = 80;

export const PLANS: Plan[] = [
  {
    id: "essencial",
    name: "Essencial",
    description: "Cardápio digital profissional com volume de pedidos ideal para quem está começando.",
    priceLabel: "R$ 49,90",
    priceCents: 4990,
    priceId: envPrice(
      "NEXT_PUBLIC_STRIPE_PRICE_ESSENCIAL",
      "price_essencial_placeholder"
    ),
    monthlyOrderLimit: ESSENCIAL_MONTHLY_ORDER_LIMIT,
    features: [
      "Cardápio público com URL personalizada",
      "Gestão de pratos e categorias",
      "Pedidos via WhatsApp",
      "Painel admin completo",
      `Até ${ESSENCIAL_MONTHLY_ORDER_LIMIT} pedidos por mês`,
    ],
  },
  {
    id: "premium",
    name: "Premium",
    description: "Tudo do Essencial com esteira Kanban e volume de pedidos sem teto para escalar.",
    priceLabel: "R$ 89,90",
    priceCents: 8990,
    priceId: envPrice(
      "NEXT_PUBLIC_STRIPE_PRICE_PREMIUM",
      "price_premium_placeholder"
    ),
    highlighted: true,
    monthlyOrderLimit: null,
    features: [
      "Tudo do plano Essencial",
      "Esteira Kanban de pedidos",
      "Pedidos ilimitados por mês",
      "Suporte prioritário",
    ],
  },
];

export function getPlanByPriceId(priceId: string): Plan | undefined {
  return PLANS.find((p) => p.priceId === priceId);
}

export function getPlanById(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}
