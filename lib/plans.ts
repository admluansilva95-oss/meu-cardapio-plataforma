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
};

const envPrice = (key: string, fallback: string) =>
  process.env[key]?.trim() || fallback;

export const PLANS: Plan[] = [
  {
    id: "essencial",
    name: "Essencial",
    description: "Cardápio digital profissional para começar a vender hoje.",
    priceLabel: "R$ 49,90",
    priceCents: 4990,
    priceId: envPrice(
      "NEXT_PUBLIC_STRIPE_PRICE_ESSENCIAL",
      "price_essencial_placeholder"
    ),
    features: [
      "Cardápio público com URL personalizada",
      "Gestão de pratos e categorias",
      "Pedidos via WhatsApp",
      "Painel admin completo",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    description: "Tudo do Essencial com recursos para escalar o delivery.",
    priceLabel: "R$ 89,90",
    priceCents: 8990,
    priceId: envPrice(
      "NEXT_PUBLIC_STRIPE_PRICE_PREMIUM",
      "price_premium_placeholder"
    ),
    highlighted: true,
    features: [
      "Tudo do plano Essencial",
      "Esteira Kanban de pedidos",
      "Upload de imagens dos pratos",
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
