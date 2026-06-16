"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isValidSlug, normalizeSlugInput } from "@/lib/billing/slug";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { fetchAppApiResilient, parseAppApiJsonResponse } from "@/lib/http/fetch-app-api";
import { sanitizeFetchInit } from "@/lib/fetch-latin1-safe";
import { latin1SafeString, stripInvisibleFormatting } from "@/lib/utils/sanitize-strings";
import { initJsonPost } from "@/lib/fetch-latin1-safe";

export function AdminConfigurarEnderecoPublico() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit() {
    const normalized = normalizeSlugInput(slug);
    if (!isValidSlug(normalized)) {
      setErrorMessage(
        "Endereço inválido. Use letras minúsculas, números e hífens (mínimo 3 caracteres).",
      );
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token?.trim();
      if (!token) {
        setErrorMessage("Sessão expirada. Faça login novamente.");
        return;
      }

      const response = await fetchAppApiResilient(
        "/api/restaurante/provision",
        sanitizeFetchInit(
          initJsonPost({ slug: normalized }, latin1SafeString(stripInvisibleFormatting(token))),
        ),
      );

      const parsed = await parseAppApiJsonResponse<{ slug?: string; error?: string }>(response);
      if (!parsed.ok || !parsed.data.slug) {
        setErrorMessage(parsed.ok ? "Resposta inválida do servidor." : parsed.userMessage);
        return;
      }

      router.replace(`/admin?slug=${encodeURIComponent(parsed.data.slug)}`);
    } catch {
      setErrorMessage("Não foi possível salvar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f5f7] px-8 py-20 font-sans text-[#1d1d1f] antialiased">
      <div className="mx-auto w-full max-w-lg">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.28em] text-[#86868b]">
          Painel
        </p>
        <h1 className="mt-4 text-center text-2xl font-semibold tracking-tight text-[#1d1d1f] sm:text-3xl">
          Endereço do seu cardápio
        </h1>
        <p className="mt-4 text-center text-[15px] leading-relaxed text-[#6e6e73]">
          Escolha o link público do cardápio. Você pode ajustar nome, WhatsApp e demais dados em
          Configurações depois do pagamento.
        </p>

        <div className="mt-8 rounded-3xl border border-black/[0.06] bg-white px-5 py-6 shadow-sm sm:px-7 sm:py-8">
          <label htmlFor="admin-onboarding-slug" className="text-xs font-medium text-[#424245]">
            Link público
          </label>
          <div className="mt-2 flex items-center gap-2 rounded-2xl border border-black/[0.08] bg-[#f5f5f7] px-4 py-3 text-sm text-[#86868b]">
            <span className="shrink-0">meucardapio.app/</span>
            <input
              id="admin-onboarding-slug"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="seu-restaurante"
              className="min-w-0 flex-1 bg-transparent text-[#1d1d1f] outline-none"
            />
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleSubmit()}
            className="mt-5 w-full rounded-xl bg-[#1d1d1f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
          >
            {loading ? "Salvando…" : "Continuar para o painel"}
          </button>
          {errorMessage ? (
            <p className="mt-4 text-center text-sm text-red-600" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
