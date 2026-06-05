"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { startSubscriptionCheckout } from "@/lib/billing/start-checkout";
import { normalizeSlugInput, slugify } from "@/lib/billing/slug";
import { parseCarryFromObParam } from "@/lib/auth/post-signup-carry";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { Plan } from "@/lib/plans";

type SubscribeButtonProps = {
  plan: Plan;
};

export function SubscribeButton({ plan }: SubscribeButtonProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [whatsapp, setWhatsapp] = useState("");
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    if (slugTouched) return;
    if (restaurantName.trim()) {
      setSlug(slugify(restaurantName));
    }
  }, [restaurantName, slugTouched]);

  useEffect(() => {
    const carry = parseCarryFromObParam(searchParams.get("ob"));
    if (!carry) return;
    setRestaurantName(carry.restaurantName);
    setSlug(carry.slug);
    setSlugTouched(true);
    if (carry.whatsapp) setWhatsapp(carry.whatsapp);
  }, [searchParams]);

  async function handleSubscribe() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("[SubscribeButton] getSession:", sessionError.message);
        setErrorMessage("Não foi possível verificar sua sessão. Tente novamente.");
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

      const carry = parseCarryFromObParam(searchParams.get("ob"));
      const priceId = carry?.priceId ?? plan.priceId;

      const checkoutSlug = existingRest?.slug ?? normalizeSlugInput(slug);
      const checkoutName = restaurantName.trim() || checkoutSlug;

      if (!existingRest?.slug) {
        if (!restaurantName.trim() || !slug.trim()) {
          setNeedsOnboarding(true);
          setErrorMessage("Informe o nome e o endereço do seu cardápio para continuar.");
          return;
        }
      }

      const checkout = await startSubscriptionCheckout({
        priceId,
        userId: session.user.id,
        accessToken: session.access_token,
        slug: checkoutSlug,
        restaurantName: checkoutName,
        whatsapp: whatsapp.trim() || undefined,
      });

      if (!checkout.ok) {
        console.error("[SubscribeButton] checkout:", checkout.error);
        setErrorMessage(checkout.error);
        return;
      }

      window.location.href = checkout.url;
    } catch (err) {
      console.error("[SubscribeButton] handleSubscribe:", err);
      setErrorMessage("Erro inesperado. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md space-y-4">
      {needsOnboarding ? (
        <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-left">
          <p className="text-xs font-medium text-zinc-600">Dados do restaurante</p>
          <input
            type="text"
            placeholder="Nome do restaurante"
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="slug-do-restaurante"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
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
