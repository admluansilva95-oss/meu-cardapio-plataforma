"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { startSubscriptionCheckout } from "@/lib/billing/start-checkout";
import { isValidSlug, normalizeSlugInput, slugify } from "@/lib/billing/slug";
import { getPlanByPriceId, PLANS } from "@/lib/plans";
import { PhoneInput } from "@/components/PhoneInput";
import { getPublicAppUrl } from "@/lib/site-url";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export function CadastroForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canceled = searchParams.get("canceled") === "1";

  const plan = useMemo(() => {
    const fromQuery = searchParams.get("priceId");
    if (fromQuery) {
      return getPlanByPriceId(fromQuery) ?? PLANS[0];
    }
    const fromEnv = process.env.NEXT_PUBLIC_STRIPE_PRICE_ESSENCIAL?.trim();
    if (fromEnv) {
      return getPlanByPriceId(fromEnv) ?? PLANS[0];
    }
    return PLANS[0];
  }, [searchParams]);

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

    const normalizedSlug = normalizeSlugInput(slug);
    if (!isValidSlug(normalizedSlug)) {
      setErrorMessage(
        "Endereço do cardápio inválido. Use letras, números e hífens (mínimo 3 caracteres)."
      );
      setLoading(false);
      return;
    }

    try {
      const supabase = createBrowserSupabaseClient();
      const afterConfirmPath = `/login?signup=1&priceId=${encodeURIComponent(plan.priceId)}`;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${getPublicAppUrl()}/auth/callback?next=${encodeURIComponent(afterConfirmPath)}`,
        },
      });

      if (error) {
        console.error("[cadastro] signUp:", error.message);
        setErrorMessage(error.message);
        return;
      }

      const session = data.session;
      if (!session?.user) {
        const loginParams = new URLSearchParams({
          priceId: plan.priceId,
          signup: "1",
        });
        router.push(`/login?${loginParams.toString()}`);
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
              <PhoneInput
                id="whatsapp"
                value={whatsapp}
                onChange={setWhatsapp}
                placeholder="(11) 91234-5678"
              />
              <p className="text-[11px] text-zinc-500">
                Escolha o DDI e digite só o DDD e o número; formatamos automaticamente.
              </p>
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
              disabled={loading}
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
              href={`/login?priceId=${encodeURIComponent(plan.priceId)}`}
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
