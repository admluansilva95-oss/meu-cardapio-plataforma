"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { startSubscriptionCheckout } from "@/lib/billing/start-checkout";
import { normalizeSlugInput, slugify } from "@/lib/billing/slug";
import { getPlanByPriceId } from "@/lib/plans";
import { createBrowserSupabaseClient } from "@/lib/supabase";

function CadastroForm() {
  const searchParams = useSearchParams();
  const priceId =
    searchParams.get("priceId") ??
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ESSENCIAL ??
    "";
  const canceled = searchParams.get("canceled") === "1";

  const plan = getPlanByPriceId(priceId);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [whatsapp, setWhatsapp] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (slugTouched) return;
    if (restaurantName.trim()) {
      setSlug(slugify(restaurantName));
    }
  }, [restaurantName, slugTouched]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    if (!plan) {
      setErrorMessage("Plano inválido. Volte à página de preços e tente novamente.");
      setLoading(false);
      return;
    }

    const normalizedSlug = normalizeSlugInput(slug);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        console.error("[cadastro] signUp:", error.message);
        setErrorMessage(error.message);
        return;
      }

      const session = data.session;
      if (!session?.user) {
        setErrorMessage(
          "Conta criada. Confirme seu e-mail se necessário, faça login e conclua o pagamento."
        );
        return;
      }

      const checkout = await startSubscriptionCheckout({
        priceId: plan.priceId,
        userId: session.user.id,
        accessToken: session.access_token,
        slug: normalizedSlug,
        restaurantName: restaurantName.trim(),
        whatsapp: whatsapp.trim() || undefined,
      });

      if (!checkout.ok) {
        setErrorMessage(checkout.error);
        return;
      }

      window.location.href = checkout.url;
    } catch (err) {
      console.error("[cadastro] handleSubmit:", err);
      setErrorMessage("Erro inesperado ao criar conta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07080c] text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_600px_at_20%_-10%,rgba(45,212,191,0.18),transparent_55%),radial-gradient(900px_500px_at_100%_0%,rgba(99,102,241,0.16),transparent_50%)]"
      />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-teal-300/90">
            Onboarding
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Crie sua conta
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Cadastre-se e finalize o pagamento no Stripe para publicar seu cardápio
            {plan ? ` (${plan.name})` : ""}.
          </p>
        </div>

        {canceled ? (
          <p className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-200">
            Pagamento cancelado. Você pode tentar novamente quando quiser.
          </p>
        ) : null}

        <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-8 backdrop-blur-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="restaurantName" className="text-xs font-medium text-zinc-300">
                Nome do restaurante
              </label>
              <input
                id="restaurantName"
                type="text"
                required
                value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-teal-400/35 focus:ring-4 focus:ring-teal-500/15"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="slug" className="text-xs font-medium text-zinc-300">
                Endereço do cardápio (slug)
              </label>
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-500">
                <span className="shrink-0">meucardapio.app/</span>
                <input
                  id="slug"
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value);
                  }}
                  className="min-w-0 flex-1 bg-transparent text-white outline-none"
                  placeholder="restaurante-do-luan"
                />
              </div>
              <p className="text-[11px] text-zinc-500">
                Só será reservado após o pagamento aprovado.
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="whatsapp" className="text-xs font-medium text-zinc-300">
                WhatsApp (opcional)
              </label>
              <input
                id="whatsapp"
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="+55 11 91234-5678"
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-teal-400/35 focus:ring-4 focus:ring-teal-500/15"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="email" className="text-xs font-medium text-zinc-300">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-teal-400/35 focus:ring-4 focus:ring-teal-500/15"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-xs font-medium text-zinc-300">
                Senha
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-teal-400/35 focus:ring-4 focus:ring-teal-500/15"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !plan}
              className="w-full rounded-2xl bg-gradient-to-r from-teal-400 via-emerald-400 to-cyan-400 py-3.5 text-sm font-semibold text-zinc-950 disabled:opacity-60"
            >
              {loading ? "Redirecionando ao pagamento…" : "Criar conta e pagar no Stripe"}
            </button>
          </form>

          {errorMessage ? (
            <p className="mt-4 text-center text-sm text-red-300" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <p className="mt-6 text-center text-sm text-zinc-500">
            Já tem conta?{" "}
            <Link
              href={priceId ? `/login?priceId=${encodeURIComponent(priceId)}` : "/login"}
              className="text-teal-300 hover:underline"
            >
              Entrar
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center">
          <Link href="/" className="text-xs text-zinc-600 hover:text-zinc-400">
            Voltar para a página inicial
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function CadastroPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#07080c] text-zinc-400">
          Carregando…
        </div>
      }
    >
      <CadastroForm />
    </Suspense>
  );
}
