"use client";

import type { LimitePedidosEstado } from "@/lib/billing/pedidos-limite-mensal";
import { isAssinaturaInadimplente } from "@/lib/billing/assinatura-status";
import { BotaoGerenciarPlano } from "@/components/BotaoGerenciarPlano";

export type LimitePedidosPainelProps = {
  estado: LimitePedidosEstado;
  pedidosNoMes: number | null;
  limite: number | null;
  percentualAtual: number | null;
};

type PainelLimitePedidosAlertaProps = {
  limite: LimitePedidosPainelProps | null;
  /** Paywall na aba Pedidos quando o limite mensal foi atingido. */
  variant?: "inline" | "paywall";
};

type PainelAssinaturaInadimplenteAlertaProps = {
  status: string | null | undefined;
  /** Paywall na aba Pedidos quando a cobrança falhou (past_due / unpaid). */
  variant?: "inline" | "paywall";
};

export function PainelAssinaturaInadimplenteAlerta({
  status,
  variant = "inline",
}: PainelAssinaturaInadimplenteAlertaProps) {
  if (!isAssinaturaInadimplente(status)) return null;

  if (variant === "paywall") {
    return (
      <div
        role="alertdialog"
        aria-labelledby="paywall-inadimplencia-titulo"
        className="flex min-h-[min(420px,60vh)] flex-col items-center justify-center rounded-3xl border border-orange-200/90 bg-gradient-to-b from-orange-50 to-white px-6 py-12 text-center shadow-[0_12px_40px_-24px_rgba(234,88,12,0.25)]"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-600/90">
          Pagamento pendente
        </p>
        <h2
          id="paywall-inadimplencia-titulo"
          className="mt-3 max-w-lg text-xl font-semibold tracking-tight text-orange-950 sm:text-2xl"
        >
          Acesso Suspenso
        </h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-orange-900/90">
          Não conseguimos processar a renovação do seu plano no cartão cadastrado. Para reativar seu
          sistema e voltar a receber pedidos, atualize seus dados de pagamento.
        </p>
        <div className="mt-8">
          <BotaoGerenciarPlano />
        </div>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="border-b border-orange-200/90 bg-orange-50 px-5 py-3 text-sm leading-relaxed text-orange-950 sm:px-8"
    >
      <span className="font-semibold">Acesso Suspenso:</span> Não conseguimos processar a renovação do
      seu plano no cartão cadastrado. Para reativar seu sistema e voltar a receber pedidos, atualize
      seus dados de pagamento.
      <div className="mt-3">
        <BotaoGerenciarPlano />
      </div>
    </div>
  );
}

export function PainelLimitePedidosAlerta({
  limite,
  variant = "inline",
}: PainelLimitePedidosAlertaProps) {
  if (!limite) return null;

  if (limite.estado === "limite_atingido" && variant === "paywall") {
    return (
      <div
        role="alertdialog"
        aria-labelledby="paywall-limite-pedidos-titulo"
        className="flex min-h-[min(420px,60vh)] flex-col items-center justify-center rounded-3xl border border-rose-200/90 bg-gradient-to-b from-rose-50 to-white px-6 py-12 text-center shadow-[0_12px_40px_-24px_rgba(190,18,60,0.25)]"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-500/90">
          Limite do plano Essencial
        </p>
        <h2
          id="paywall-limite-pedidos-titulo"
          className="mt-3 max-w-lg text-xl font-semibold tracking-tight text-rose-950 sm:text-2xl"
        >
          Seu cardápio público não pode receber novos pedidos
        </h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-rose-900/85">
          Você atingiu o limite de {limite.limite ?? 150} pedidos deste mês no plano Essencial. Faça upgrade
          para o Premium e volte a receber pedidos pelo cardápio.
        </p>
        {limite.pedidosNoMes != null && limite.limite != null ? (
          <p className="mt-4 font-mono text-sm tabular-nums text-rose-800/90">
            {limite.pedidosNoMes} / {limite.limite} pedidos neste mês
          </p>
        ) : null}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <BotaoGerenciarPlano />
          <a
            href="/assinar?plan=premium"
            className="inline-flex items-center justify-center rounded-md border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-900 shadow-sm transition hover:bg-rose-50"
          >
            Fazer upgrade para Premium
          </a>
        </div>
      </div>
    );
  }

  if (limite.estado === "aviso_80") {
    return (
      <div
        role="status"
        className="border-b border-amber-200/90 bg-amber-50 px-5 py-3 text-sm leading-relaxed text-amber-950 sm:px-8"
      >
        Você atingiu 80% do seu limite de pedidos deste mês
        {limite.pedidosNoMes != null && limite.limite != null ? (
          <>
            {" "}
            ({limite.pedidosNoMes} de {limite.limite} pedidos
            {limite.percentualAtual != null ? ` · ${limite.percentualAtual}%` : ""}). Considere fazer upgrade
            para o Premium e evitar interrupções.
          </>
        ) : (
          ". Considere fazer upgrade para o Premium e evitar interrupções."
        )}
      </div>
    );
  }

  if (limite.estado === "limite_atingido" && variant === "inline") {
    return (
      <div
        role="alert"
        className="border-b border-rose-200/90 bg-rose-50 px-5 py-3 text-sm leading-relaxed text-rose-950 sm:px-8"
      >
        <span className="font-semibold">Limite atingido:</span> novos pedidos pelo cardápio público estão
        bloqueados. Faça upgrade para o Premium para continuar recebendo pedidos.
      </div>
    );
  }

  return null;
}
