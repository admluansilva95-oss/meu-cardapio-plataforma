import './globals.css';

export const metadata = {
  title: 'Celeiro Roast - Cardápio Virtual',
  description: 'Venha conferir nossas delícias e faça seu pedido!',
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
