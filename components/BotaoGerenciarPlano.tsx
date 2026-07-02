'use client';

import { useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase';
import { fetchAppApiResilient, parseAppApiJsonResponse } from '@/lib/http/fetch-app-api';
import { sanitizeFetchInit } from '@/lib/fetch-latin1-safe';
import { latin1SafeString, stripInvisibleFormatting } from '@/lib/utils/sanitize-strings';

export function BotaoGerenciarPlano() {
  const [loading, setLoading] = useState(false);

  const handleGerenciarPlano = async () => {
    try {
      setLoading(true);

      const supabase = createBrowserSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const token = session?.access_token?.trim();
      if (!token) {
        alert('Sessão expirada. Faça login novamente.');
        return;
      }

      const response = await fetchAppApiResilient(
        '/api/stripe/portal',
        sanitizeFetchInit({
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${latin1SafeString(stripInvisibleFormatting(token))}`,
          },
        }),
      );

      const parsed = await parseAppApiJsonResponse<{ url?: string; error?: string }>(response);

      if (parsed.ok && parsed.data.url) {
        window.location.href = parsed.data.url;
        return;
      }

      alert(
        parsed.ok
          ? 'Erro ao redirecionar para o gerenciamento de plano.'
          : parsed.userMessage,
      );
    } catch (error) {
      console.error(error);
      alert('Erro interno ao conectar com o Stripe.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleGerenciarPlano}
      disabled={loading}
      aria-busy={loading}
      aria-live="polite"
      className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md transition disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? (
        <>
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
            aria-hidden
          />
          Carregando...
        </>
      ) : (
        "Trocar plano / Gerenciar assinatura"
      )}
    </button>
  );
}
