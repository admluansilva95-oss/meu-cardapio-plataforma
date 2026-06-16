"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { startSubscriptionCheckout } from "@/lib/billing/start-checkout";
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
  carryOb?: string | null;
};

export function SubscribeButton({ plan, carryOb = null }: SubscribeButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState("");

  useEffect(() => {
    const carry = parseCarryFromObParam(carryOb);
    if (carry?.whatsapp) setWhatsapp(carry.whatsapp);
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

      const carry = parseCarryFromObParam(carryOb);
      const priceId = carry?.priceId ?? plan.priceId;

      const checkout = await startSubscriptionCheckout({
        priceId,
        userId: session.user.id,
        accessToken: session.access_token,
        slug: carry?.slug,
        whatsapp: whatsapp.trim() || carry?.whatsapp,
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
      <p className="text-center text-xs leading-relaxed text-zinc-500">
        Após o pagamento, você define o endereço público do cardápio no painel admin.
      </p>
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
