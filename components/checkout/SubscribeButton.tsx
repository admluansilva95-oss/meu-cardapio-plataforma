"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { startSubscriptionCheckout } from "@/lib/billing/start-checkout";
import { isValidSlug, normalizeSlugInput } from "@/lib/billing/slug";
import { parseCarryFromObParam } from "@/lib/auth/post-signup-carry";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { Plan } from "@/lib/plans";
import {
  authGetSessionSafe,
  isSupabaseBrowserEnvConfigured,
  mensagemFalhaAutenticacaoResidual,
  MENSAGEM_SUPABASE_ENV_AUSENTE,
} from "@/lib/auth/supabase-browser-auth-safe";
import { mensagemErroSupabaseAuthAmigavel } from "@/lib/auth/validacao-credenciais";
import { devClientError } from "@/lib/logging/dev-client-log";

type SubscribeButtonProps = {
  plan: Plan;
  /** Parâmetro `ob` (pós-cadastro) vindo do servidor — evita `useSearchParams` e suspense infinito. */
  carryOb?: string | null;
};

export function SubscribeButton({ plan, carryOb = null }: SubscribeButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    const carry = parseCarryFromObParam(carryOb);
    if (!carry) return;
    setSlug(carry.slug);
    if (carry.whatsapp) setWhatsapp(carry.whatsapp);
  }, [carryOb]);

  async function handleSubscribe() {
    setLoading(true);
    setErrorMessage(null);

    try {
      if (!isSupabaseBrowserEnvConfigured()) {
        setErrorMessage(MENSAGEM_SUPABASE_ENV_AUSENTE);
        return;
      }

      const supabase = createBrowserSupabaseClient();
      const {
        data: { session },
        error: sessionError,
      } = await authGetSessionSafe(supabase);

      if (sessionError) {
        devClientError("[SubscribeButton] getSession:", sessionError.message);
        setErrorMessage(mensagemErroSupabaseAuthAmigavel(sessionError));
        return;
      }

      if (!session?.user) {
        const params = new URLSearchParams({ priceId: plan.priceId });
        router.push(`/cadastro?${params.toString()}`);
        return;
      }

      const { data: existingRest } = await supabase
        .from("restaurantes")
        .select("slug")
        .eq("owner_id", session.user.id)
        .limit(1)
        .maybeSingle();

      const carry = parseCarryFromObParam(carryOb);
      const priceId = carry?.priceId ?? plan.priceId;

      const normalized = normalizeSlugInput(slug);
      const checkoutSlug = existingRest?.slug ?? normalized;

      if (!existingRest?.slug) {
        if (!normalized || !isValidSlug(normalized)) {
          setNeedsOnboarding(true);
          setErrorMessage(
            "Informe um endereço válido para o cardápio (letras minúsculas, números e hífens, mín. 3 caracteres).",
          );
          return;
        }
      }

      const checkout = await startSubscriptionCheckout({
        priceId,
        userId: session.user.id,
        accessToken: session.access_token,
        slug: checkoutSlug,
        whatsapp: whatsapp.trim() || undefined,
      });

      if (!checkout.ok) {
        devClientError("[SubscribeButton] checkout:", checkout.error);
        setErrorMessage(checkout.error);
        return;
      }

      window.location.assign(checkout.url);
    } catch (err) {
      devClientError("[SubscribeButton] handleSubscribe:", err);
      setErrorMessage(mensagemFalhaAutenticacaoResidual("assinatura"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md space-y-4">
      {needsOnboarding ? (
        <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-left">
          <p className="text-xs font-medium text-zinc-600">Endereço do cardápio</p>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Escolha o link público (slug). O nome exibido no cardápio você ajusta no painel, em Painel de
            configuração.
          </p>
          <input
            type="text"
            placeholder="slug-do-restaurante"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
        </div>
      ) : null}
      <button
        type="button"
        onClick={handleSubscribe}
        disabled={loading}
        className="w-full rounded-2xl bg-zinc-900 px-6 py-4 text-sm font-semibold text-white shadow-lg shadow-zinc-900/15 transition hover:bg-zinc-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Preparando checkout…" : "Assinar"}
      </button>
      {errorMessage ? (
        <p className="text-center text-sm text-red-600" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
