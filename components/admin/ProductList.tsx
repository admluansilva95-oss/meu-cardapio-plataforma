"use client";

import type { Prato } from "../../types";

export interface ProductListProps {
  restauranteId: string;
  pratos: Prato[];
  onEdit: (prato: Prato) => void;
  onDelete: (prato: Prato) => void;
  /** Quando o Supabase estiver carregando a query */
  loading?: boolean;
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ProductList({
  restauranteId,
  pratos,
  onEdit,
  onDelete,
  loading,
}: ProductListProps) {
  const rows = pratos.filter((p) => p.restaurante_id === restauranteId);

  if (loading) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center text-sm text-slate-500">
        Carregando pratos…{" "}
        <span className="block pt-2 text-xs text-slate-400">
          Substitua por estado vindo do <code className="rounded bg-slate-200 px-1">fetch</code>{" "}
          Supabase.
        </span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
        <p className="text-sm font-medium text-slate-800">Nenhum prato neste restaurante</p>
        <p className="mt-2 text-sm text-slate-500">
          Use &quot;Novo prato&quot; para criar o primeiro item do cardápio.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Pratos</h3>
          <p className="text-xs text-slate-500">
            Filtrados por <span className="font-mono text-slate-600">{restauranteId}</span>
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {rows.length} {rows.length === 1 ? "item" : "itens"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
          <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Nome</th>
              <th className="px-5 py-3">Preço</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((prato) => (
              <tr key={prato.id} className="hover:bg-slate-50/60">
                <td className="px-5 py-3">
                  <div className="font-medium text-slate-900">{prato.nome}</div>
                  {prato.descricao ? (
                    <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                      {prato.descricao}
                    </div>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-slate-700">
                  {formatBRL(prato.preco)}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={[
                      "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                      prato.status === "ativo"
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15"
                        : "bg-amber-50 text-amber-800 ring-1 ring-amber-600/15",
                    ].join(" ")}
                  >
                    {prato.status === "ativo" ? "Ativo" : "Pausado"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onEdit(prato)}
                    className="mr-2 rounded-lg px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-50"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(prato)}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
