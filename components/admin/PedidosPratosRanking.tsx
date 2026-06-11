import type { PratoRankingLinha } from "@/lib/admin/prato-ranking-from-pedidos";

export type PedidosPratosRankingProps = {
  linhas: readonly PratoRankingLinha[];
};

export function PedidosPratosRanking({ linhas }: PedidosPratosRankingProps) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-[0_8px_30px_-16px_rgba(0,0,0,0.08)] sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Ranking</p>
      <h2 className="mt-1 text-sm font-semibold tracking-tight text-zinc-900">Pratos mais pedidos</h2>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">Soma das quantidades nos pedidos carregados (texto da esteira).</p>
      {linhas.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 px-3 py-6 text-center text-xs text-zinc-500">
          Sem dados ainda — quando houver pedidos com itens no formato da vitrine, o ranking aparece aqui.
        </p>
      ) : (
        <ol className="mt-4 space-y-2">
          {linhas.map((row, idx) => (
            <li
              key={row.nome}
              className="flex items-center justify-between gap-3 rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-bold text-zinc-700 shadow-sm ring-1 ring-zinc-100">
                  {idx + 1}
                </span>
                <span className="truncate text-sm font-medium text-zinc-900" title={row.nome}>
                  {row.nome}
                </span>
              </div>
              <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold tabular-nums text-zinc-700 ring-1 ring-zinc-100">
                {row.unidades} {row.unidades === 1 ? "unidade" : "unidades"}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
