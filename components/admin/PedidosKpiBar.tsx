import type { PedidoKpis } from "@/lib/admin/pedido-kpis";
import { formatBRL } from "@/lib/restaurante/format-brl";

function KpiCard(props: {
  label: string;
  hint: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-2xl border border-black/[0.06] bg-white p-4 shadow-[0_8px_30px_-16px_rgba(0,0,0,0.1)] sm:p-5",
        props.accent,
      ].join(" ")}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#86868b]">{props.label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-[#1d1d1f] tabular-nums sm:text-2xl">{props.value}</p>
      <p className="mt-1.5 text-xs leading-snug text-[#6e6e73]">{props.hint}</p>
    </div>
  );
}

export type PedidosKpiBarProps = {
  kpis: PedidoKpis;
  /** `sidebar`: coluna estreita (painel 30%). `wide`: grade até 4 colunas. */
  variant?: "wide" | "sidebar";
  className?: string;
};

export function PedidosKpiBar({ kpis, variant = "wide", className = "" }: PedidosKpiBarProps) {
  const grid =
    variant === "sidebar"
      ? "grid grid-cols-1 gap-3"
      : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5";

  return (
    <div className={`${variant === "wide" ? "mb-6" : ""} ${grid} ${className}`.trim()}>
      <KpiCard
        label="Faturamento hoje"
        hint="Total vendido hoje (pedidos com data de hoje)."
        value={formatBRL(kpis.faturamentoHoje)}
        accent="ring-1 ring-emerald-500/10"
      />
      <KpiCard
        label="7 dias"
        hint="Faturamento dos últimos 7 dias."
        value={formatBRL(kpis.faturamento7dias)}
        accent="ring-1 ring-sky-500/10"
      />
      <KpiCard
        label="Em andamento"
        hint="Pedidos fora da coluna Entregue."
        value={String(kpis.pedidosEmAndamento)}
        accent="ring-1 ring-amber-500/10"
      />
      <KpiCard
        label="Volume (7d)"
        hint="Quantidade de pedidos nos últimos 7 dias."
        value={String(kpis.pedidosUltimos7d)}
        accent="ring-1 ring-indigo-500/10"
      />
      <KpiCard
        label="Ticket médio"
        hint="Média no período de 7 dias."
        value={formatBRL(kpis.ticketMedio7d)}
        accent="ring-1 ring-violet-500/10"
      />
    </div>
  );
}
