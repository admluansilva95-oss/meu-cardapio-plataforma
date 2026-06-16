'use client';

import { useState } from 'react';

export function BotaoGerenciarPlano() {
  const [loading, setLoading] = useState(false);

  const handleGerenciarPlano = async () => {
    try {
      setLoading(true);

      const response = await fetch('/api/stripe/portal', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        alert('Erro ao redirecionar para o gerenciamento de plano.');
      }
    } catch (error) {
      console.error(error);
      alert('Erro interno ao conectar com o Stripe.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleGerenciarPlano}
      disabled={loading}
      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md transition disabled:opacity-50"
    >
      {loading ? 'Carregando...' : 'Gerenciar Plano / Upgrade'}
    </button>
  );
}
