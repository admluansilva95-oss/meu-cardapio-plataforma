export const metadata = {
  title: 'Meu Cardápio Virtual',
  description: 'Venha conferir nossas delícias!',
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
