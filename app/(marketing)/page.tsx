import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { InteractiveDemo } from "@/components/marketing/InteractiveDemo";
import { PricingTable } from "@/components/marketing/PricingTable";
import { ArrowRight, Sparkles } from "lucide-react";

export default function MarketingHomePage() {
  return (
    <div className="min-h-screen bg-white text-zinc-950 antialiased">
      <MarketingNav />

      <main>
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_500px_at_50%_-20%,rgba(24,24,27,0.06),transparent_60%)]"
          />
          <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-20 sm:pt-28 sm:pb-28">
            <div className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-1.5 text-xs font-medium text-zinc-600">
                <Sparkles className="h-3.5 w-3.5 text-zinc-900" aria-hidden />
                Cardápio digital para restaurantes modernos
              </div>
              <h1 className="mt-8 text-4xl font-semibold tracking-tight text-zinc-950 sm:text-6xl sm:leading-[1.08]">
                Seu cardápio online.
                <br />
                <span className="text-zinc-500">Bonito. Rápido. Lucrativo.</span>
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-zinc-600">
                Publique um cardápio com a cara do seu restaurante, receba pedidos pelo
                WhatsApp e gerencie tudo em um painel feito para converter visitantes em
                clientes.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href="/assinar?plan=essencial"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-zinc-900/15 transition hover:bg-zinc-800 active:scale-[0.99] sm:w-auto"
                >
                  Começar agora
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <a
                  href="#demo"
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-zinc-200 bg-white px-8 py-4 text-sm font-semibold text-zinc-900 transition hover:border-zinc-300 hover:bg-zinc-50 sm:w-auto"
                >
                  Ver demonstração
                </a>
              </div>
              <p className="mt-6 text-xs text-zinc-500">
                A partir de R$ 49,90/mês · Sem fidelidade · Setup em minutos
              </p>
            </div>

            <div className="mx-auto mt-16 max-w-4xl">
              <div className="rounded-3xl border border-zinc-200 bg-gradient-to-b from-zinc-50 to-white p-2 shadow-2xl shadow-zinc-900/5">
                <div className="overflow-hidden rounded-[1.35rem] border border-zinc-200/80 bg-white">
                  <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
                    <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
                    <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
                    <span className="ml-3 font-mono text-xs text-zinc-400">
                      meucardapio.app/preview
                    </span>
                  </div>
                  <div className="grid gap-px bg-zinc-100 sm:grid-cols-3">
                    {["Entradas", "Pratos", "Bebidas"].map((cat) => (
                      <div key={cat} className="bg-white p-6">
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                          {cat}
                        </p>
                        <div className="mt-4 space-y-3">
                          <div className="h-2 w-3/4 rounded bg-zinc-100" />
                          <div className="h-2 w-1/2 rounded bg-zinc-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <InteractiveDemo />
        <PricingTable />

        <section className="border-t border-zinc-200/80 py-20">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Pronto para colocar seu cardápio no ar?
            </h2>
            <p className="mt-4 text-zinc-600">
              Escolha um plano e finalize a assinatura em poucos cliques.
            </p>
            <Link
              href="/assinar?plan=premium"
              className="mt-8 inline-flex items-center justify-center rounded-2xl bg-zinc-900 px-8 py-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Assinar agora
            </Link>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
