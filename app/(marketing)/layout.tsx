import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Meu Cardápio — Cardápio digital que converte",
  description:
    "Crie seu cardápio online, receba pedidos pelo WhatsApp e gerencie tudo em um painel premium.",
  openGraph: {
    title: "Meu Cardápio — Cardápio digital que converte",
    description:
      "SaaS multi-tenant para restaurantes: landing, assinatura e painel em minutos.",
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
