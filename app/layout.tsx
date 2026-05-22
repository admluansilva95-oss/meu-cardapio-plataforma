import './globals.css';

export const metadata = {
  title: 'Nome do Restaurante - Cardápio Virtual', // Altere para o nome real se quiser
  description: 'Venha conferir nossas delícias e faça seu pedido!',
  openGraph: {
    title: 'Nome do Restaurante - Cardápio Virtual',
    description: 'Venha conferir nossas delícias e faça seu pedido!',
    images: [
      {
        url: 'https://i.imgur.com/seu-codigo-da-foto.jpg', // LINK REAL DA SUA FOTO AQUI
        width: 1200,
        height: 630,
        alt: 'Capa do Cardápio',
      },
    ],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
