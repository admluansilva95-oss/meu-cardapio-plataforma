import './globals.css';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Celeiro Roast - Cardápio Virtual',
  description: 'Venha conferir nossas delícias e faça seu pedido!',
  metadataBase: new URL('https://celeitoroast.netlify.app'),
  openGraph: {
    title: 'Celeiro Roast - Cardápio Virtual',
    description: 'Venha conferir nossas delícias e faça seu pedido!',
    url: 'https://celeitoroast.netlify.app',
    siteName: 'Celeiro Roast',
    images: [
      {
        url: '/opengraph-image.png', // O Next.js vai buscar direto da raiz da pasta app
        width: 1200,
        height: 630,
        alt: 'Logo Celeiro Roast',
      },
    ],
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Celeiro Roast - Cardápio Virtual',
    description: 'Venha conferir nossas delícias e faça seu pedido!',
    images: ['/opengraph-image.png'],
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
