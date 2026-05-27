import "./globals.css";

export const metadata = {
  title: "Cardápio digital",
  description: "Cardápio online e pedidos pelo WhatsApp.",
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
