import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Assinar — Meu Cardápio",
  description: "Finalize sua assinatura e publique seu cardápio digital.",
};

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
