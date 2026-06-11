/** Formato gerado em `linhasItensTexto` (API vitrine): `2x Nome (R$ … cada)`. */
const LINHA_ITEM_RE = /^(\d+)\s*x\s+(.+?)\s+\(/;

export type PratoRankingLinha = {
  nome: string;
  /** Soma das quantidades vendidas (unidades). */
  unidades: number;
};

/**
 * Ranking aproximado a partir das linhas de texto persistidas em `pedidos.itens`
 * (compatível com pedidos atuais; linhas em outro formato são ignoradas).
 */
export function computePratoRankingFromPedidosLines(
  pedidos: readonly { itens: readonly string[] }[],
  limit = 10,
): PratoRankingLinha[] {
  const counts = new Map<string, number>();
  for (const p of pedidos) {
    for (const line of p.itens) {
      const m = line.match(LINHA_ITEM_RE);
      if (!m) continue;
      const q = Number.parseInt(m[1]!, 10);
      const nome = m[2]!.trim();
      if (!nome || !Number.isFinite(q) || q <= 0) continue;
      counts.set(nome, (counts.get(nome) ?? 0) + q);
    }
  }
  return [...counts.entries()]
    .map(([nome, unidades]) => ({ nome, unidades }))
    .sort((a, b) => b.unidades - a.unidades)
    .slice(0, Math.max(0, limit));
}
