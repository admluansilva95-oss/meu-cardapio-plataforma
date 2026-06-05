import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SubscribeButton } from "@/components/checkout/SubscribeButton";
import { getPlanById, PLANS } from "@/lib/plans";
import { Check } from "lucide-react";

type PageProps = {
  searchParams: Promise<{ plan?: string; priceId?: string }>;
};

export default async function AssinarPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const planFromQuery = params.plan ? getPlanById(params.plan) : undefined;
  const planFromPriceId = params.priceId
    ? PLANS.find((p) => p.priceId === params.priceId)
    : undefined;
  const plan = planFromQuery ?? planFromPriceId ?? PLANS[0];

  if (!plan) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 antialiased">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            Meu Cardápio
          </Link>
          <Link
            href={`/login?priceId=${encodeURIComponent(plan.priceId)}`}
            className="text-sm text-zinc-600 hover:text-zinc-950"
          >
            Já tenho conta
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">
          Checkout
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Plano {plan.name}
        </h1>
        <p className="mt-3 text-zinc-600">{plan.description}</p>

        <div className="mt-10 rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
          <div className="flex items-baseline justify-between gap-4 border-b border-zinc-100 pb-8">
            <div>
              <p className="text-sm text-zinc-500">Valor mensal</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">
                {plan.priceLabel}
              </p>
            </div>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
              Cobrança recorrente
            </span>
          </div>

          <ul className="mt-8 space-y-3">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-sm text-zinc-700">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                {feature}
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-col items-center">
            <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
              <SubscribeButton plan={plan} />
            </Suspense>
            <p className="mt-4 text-center text-xs text-zinc-500">
              Pagamento seguro via Stripe. Você será redirecionado ao checkout.
            </p>
          </div>
        </div>

        <div className="mt-8">
          <p className="text-sm font-medium text-zinc-700">Outro plano?</p>
          <ul className="mt-3 flex flex-wrap gap-3">
            {PLANS.filter((p) => p.id !== plan.id).map((other) => (
              <li key={other.id}>
                <Link
                  href={`/assinar?plan=${other.id}`}
                  className="text-sm text-zinc-600 underline-offset-4 hover:text-zinc-950 hover:underline"
                >
                  {other.name} — {other.priceLabel}/mês
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
