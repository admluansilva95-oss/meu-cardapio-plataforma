import Link from "next/link";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingNav } from "@/components/marketing/MarketingNav";

type LegalPageShellProps = {
  title: string;
  children: React.ReactNode;
};

export function LegalPageShell({ title, children }: LegalPageShellProps) {
  return (
    <div className="min-h-screen bg-white text-zinc-950 antialiased">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-400">
          Meu Cardápio
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{title}</h1>
        <div className="prose prose-zinc mt-10 max-w-none text-[15px] leading-relaxed text-zinc-700 prose-headings:font-semibold prose-headings:tracking-tight prose-h2:mt-10 prose-h2:text-lg prose-p:mt-4">
          {children}
        </div>
        <p className="mt-12 text-sm text-zinc-500">
          <Link href="/" className="text-zinc-800 underline-offset-2 hover:underline">
            Voltar para a página inicial
          </Link>
        </p>
      </main>
      <MarketingFooter />
    </div>
  );
}
