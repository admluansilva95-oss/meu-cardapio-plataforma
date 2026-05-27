import Link from "next/link";
import { PLANS } from "@/lib/plans";
import { Check } from "lucide-react";

export function PricingTable() {
  return (
    <section
      id="planos"
      className="relative border-t border-zinc-200/80 bg-zinc-50/50 py-24 sm:py-32"
      aria-labelledby="pricing-heading"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">
            Planos
          </p>
          <h2
            id="pricing-heading"
            className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl"
          >
            Preço claro, sem surpresas
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Escolha o plano ideal e comece em minutos. Cancele quando quiser.
          </p>
        </div>

        <div className="mt-14 grid gap-8 lg:grid-cols-2">
          {PLANS.map((plan) => (
            <article
              key={plan.id}
              className={`relative flex flex-col rounded-3xl border p-8 sm:p-10 ${
                plan.highlighted
                  ? "border-zinc-900 bg-zinc-950 text-white shadow-2xl shadow-zinc-900/20"
                  : "border-zinc-200 bg-white text-zinc-950 shadow-sm"
              }`}
            >
              {plan.highlighted ? (
                <span className="absolute -top-3 left-8 rounded-full bg-white px-3 py-1 text-xs font-semibold text-zinc-950">
                  Mais popular
                </span>
              ) : null}

              <h3 className="text-xl font-semibold tracking-tight">{plan.name}</h3>
              <p
                className={`mt-2 text-sm leading-relaxed ${
                  plan.highlighted ? "text-zinc-400" : "text-zinc-600"
                }`}
              >
                {plan.description}
              </p>

              <p className="mt-8 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight">
                  {plan.priceLabel}
                </span>
                <span
                  className={`text-sm ${
                    plan.highlighted ? "text-zinc-500" : "text-zinc-500"
                  }`}
                >
                  /mês
                </span>
              </p>

              <ul className="mt-8 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm">
                    <Check
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        plan.highlighted ? "text-emerald-400" : "text-emerald-600"
                      }`}
                      aria-hidden
                    />
                    <span className={plan.highlighted ? "text-zinc-300" : "text-zinc-700"}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href={`/assinar?plan=${plan.id}`}
                className={`mt-10 inline-flex items-center justify-center rounded-2xl px-6 py-3.5 text-sm font-semibold transition active:scale-[0.99] ${
                  plan.highlighted
                    ? "bg-white text-zinc-950 hover:bg-zinc-100"
                    : "bg-zinc-900 text-white hover:bg-zinc-800"
                }`}
              >
                Assinar {plan.name}
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
