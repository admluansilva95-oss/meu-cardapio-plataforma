/** Dados mínimos para KPIs de faturamento no painel. */
export type PedidoKpiSource = {
  total: number;
  coluna: string;
  criado_em: string;
};

export type PedidoKpis = {
  faturamentoHoje: number;
  faturamento7dias: number;
  pedidosEmAndamento: number;
  pedidosUltimos7d: number;
  ticketMedio7d: number;
};

function startOfLocalDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/**
 * Agrega faturamento e contagens a partir da lista de pedidos em memória
 * (reflete Realtime + loadData). Usa fuso do navegador para “hoje”.
 */
export function computePedidoKpis(pedidos: PedidoKpiSource[], refDate: Date = new Date()): PedidoKpis {
  const t0 = startOfLocalDay(refDate);
  const t1 = startOfLocalDay(addDays(refDate, 1));
  const t7 = startOfLocalDay(addDays(refDate, -7));

  let faturamentoHoje = 0;
  let faturamento7dias = 0;
  let pedidosUltimos7d = 0;
  let pedidosEmAndamento = 0;

  for (const p of pedidos) {
    const created = new Date(p.criado_em).getTime();
    if (!Number.isFinite(created)) continue;

    const valor = Number.isFinite(p.total) ? p.total : 0;

    if (created >= t0 && created < t1) {
      faturamentoHoje += valor;
    }
    if (created >= t7) {
      faturamento7dias += valor;
      pedidosUltimos7d += 1;
    }
    if (p.coluna !== "entregue") {
      pedidosEmAndamento += 1;
    }
  }

  const ticketMedio7d = pedidosUltimos7d > 0 ? faturamento7dias / pedidosUltimos7d : 0;

  return {
    faturamentoHoje,
    faturamento7dias,
    pedidosEmAndamento,
    pedidosUltimos7d,
    ticketMedio7d,
  };
}
