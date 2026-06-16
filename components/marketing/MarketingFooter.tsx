import Link from "next/link";

export function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-zinc-200 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-center text-xs text-zinc-500 sm:flex-row sm:justify-between sm:text-left">
        <p>© {year} Meu Cardápio · Cardápio digital SaaS</p>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link href="/termos" className="transition hover:text-zinc-800">
            Termos de uso
          </Link>
          <Link href="/privacidade" className="transition hover:text-zinc-800">
            Privacidade
          </Link>
          <Link href="/login" className="transition hover:text-zinc-800">
            Entrar
          </Link>
        </nav>
      </div>
    </footer>
  );
}
