import type { PedidoKpis } from "@/lib/admin/pedido-kpis";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function KpiCard(props: {
  label: string;
  hint: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-2xl border border-black/[0.06] bg-white p-5 shadow-[0_8px_30px_-16px_rgba(0,0,0,0.1)]",
        props.accent,
      ].join(" ")}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#86868b]">{props.label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-[#1d1d1f] tabular-nums">{props.value}</p>
      <p className="mt-1.5 text-xs leading-snug text-[#6e6e73]">{props.hint}</p>
    </div>
  );
}

type PedidosKpiBarProps = {
  kpis: PedidoKpis;
};

export function PedidosKpiBar({ kpis }: PedidosKpiBarProps) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Hoje"
        hint="Soma dos pedidos com data de hoje."
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
        label="Ticket médio"
        hint="Média no período de 7 dias."
        value={formatBRL(kpis.ticketMedio7d)}
        accent="ring-1 ring-violet-500/10"
      />
    </div>
  );
}
