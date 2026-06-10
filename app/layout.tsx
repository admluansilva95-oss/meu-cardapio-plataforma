import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cardápio digital",
  description: "Cardápio online e pedidos pelo WhatsApp.",
  referrer: "no-referrer",
  openGraph: {
    title: "Cardápio digital",
    description: "Cardápio online e pedidos pelo WhatsApp.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
