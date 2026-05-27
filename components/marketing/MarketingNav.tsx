import Link from "next/link";

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/60 bg-white/80 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-sm font-semibold tracking-tight text-zinc-950">
          Meu Cardápio
        </Link>
        <div className="flex items-center gap-6 text-sm">
          <a
            href="#demo"
            className="hidden text-zinc-600 transition hover:text-zinc-950 sm:inline"
          >
            Demo
          </a>
          <a
            href="#planos"
            className="hidden text-zinc-600 transition hover:text-zinc-950 sm:inline"
          >
            Planos
          </a>
          <Link
            href="/login"
            className="text-zinc-600 transition hover:text-zinc-950"
          >
            Entrar
          </Link>
          <Link
            href="/assinar?plan=premium"
            className="rounded-full bg-zinc-900 px-4 py-2 font-medium text-white transition hover:bg-zinc-800"
          >
            Começar
          </Link>
        </div>
      </nav>
    </header>
  );
}
