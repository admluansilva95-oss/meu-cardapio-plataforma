import type { PedidoKpis } from "@/lib/admin/pedido-kpis";
import type { PratoRankingLinha } from "@/lib/admin/prato-ranking-from-pedidos";
import { PedidosKpiBar } from "@/components/admin/PedidosKpiBar";
import { PedidosPratosRanking } from "@/components/admin/PedidosPratosRanking";

export type AdminOperacionalPainelLateralProps = {
  kpis: PedidoKpis;
  rankingLinhas: readonly PratoRankingLinha[];
  className?: string;
  /** `sidebar`: coluna estreita ao lado da esteira. `page`: aba dedicada em largura total. */
  layout?: "sidebar" | "page";
};

/**
 * Resumo financeiro + ranking — coluna lateral (Pedidos/Pratos legado) ou aba própria.
 */
export function AdminOperacionalPainelLateral({
  kpis,
  rankingLinhas,
  className = "",
  layout = "sidebar",
}: AdminOperacionalPainelLateralProps) {
  if (layout === "page") {
    return (
      <div className={`mx-auto max-w-6xl space-y-6 ${className}`.trim()}>
        <div className="rounded-3xl border border-zinc-100/80 bg-white px-5 py-6 shadow-[0_8px_30px_-16px_rgba(0,0,0,0.08)] sm:px-7 sm:py-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Resumo financeiro
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-500">
            Faturamento, volume e ticket médio com base nos pedidos carregados nesta sessão do painel.
          </p>
          <div className="mt-5">
            <PedidosKpiBar variant="wide" kpis={kpis} className="mb-0" />
          </div>
        </div>
        <PedidosPratosRanking linhas={rankingLinhas} />
      </div>
    );
  }

  return (
    <aside
      className={[
        "order-1 w-full space-y-4 lg:sticky lg:top-6 lg:order-2 lg:min-w-0 lg:max-w-none lg:self-start",
        className,
      ].join(" ")}
    >
      <div className="rounded-2xl border border-zinc-100/80 bg-white/90 p-1 shadow-[0_8px_30px_-16px_rgba(0,0,0,0.08)] backdrop-blur-sm">
        <p className="px-3 pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Resumo financeiro
        </p>
        <p className="px-3 pb-0 text-[11px] leading-snug text-zinc-500">
          Faturamento do dia e volume — dados dos pedidos carregados.
        </p>
        <div className="p-3 pt-1">
          <PedidosKpiBar variant="sidebar" kpis={kpis} />
        </div>
      </div>
      <PedidosPratosRanking linhas={rankingLinhas} />
    </aside>
  );
}
