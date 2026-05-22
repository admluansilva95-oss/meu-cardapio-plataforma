import './globals.css';

export const metadata = {
  title: 'Celeiro Roast - Cardápio Virtual',
  description: 'Venha conferir nossas delícias e faça seu pedido!',
  openGraph: {
    title: 'Celeiro Roast - Cardápio Virtual',
    description: 'Venha conferir nossas delícias e faça seu pedido!',
    images: [
      {
        url: 'https://celeitoroast.netlify.app/opengraph-image.png', // Se for JPG, mude para .jpg aqui no final
        width: 1200,
        height: 630,
        alt: 'Logo Celeiro Roast',
      },
    ],
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
