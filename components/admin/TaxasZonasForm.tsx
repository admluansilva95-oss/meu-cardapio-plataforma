"use client";

import type { TaxaEntregaZona } from "@/lib/restaurante/taxas-entrega-zonas";
import { novaTaxaZonaId } from "@/lib/restaurante/taxas-entrega-zonas";
import { parsePrecoBrasileiro } from "@/lib/restaurante/preco-input";

export function TaxasZonasForm(props: {
  value: TaxaEntregaZona[];
  onChange: (next: TaxaEntregaZona[]) => void;
}) {
  const { value, onChange } = props;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-[#86868b]">
          Taxas por região
        </label>
        <button
          type="button"
          onClick={() =>
            onChange([...value, { id: novaTaxaZonaId(), nome: "", valor: 0 }])
          }
          className="rounded-full bg-[#1d1d1f] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black"
        >
          + Nova taxa
        </button>
      </div>
      {value.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/[0.1] bg-[#fafafa] px-4 py-6 text-center text-sm text-[#86868b]">
          Nenhuma taxa cadastrada. Adicione bairros ou faixas (ex.: Centro, Zona sul) com valores diferentes.
        </p>
      ) : (
        <ul className="space-y-2">
          {value.map((z, idx) => (
            <li
              key={z.id}
              className="flex flex-col gap-2 rounded-xl border border-black/[0.08] bg-white p-3 sm:flex-row sm:items-center sm:gap-3"
            >
              <input
                type="text"
                value={z.nome}
                onChange={(e) => {
                  const next = [...value];
                  next[idx] = { ...z, nome: e.target.value };
                  onChange(next);
                }}
                placeholder="Bairro ou região"
                className="min-w-0 flex-1 rounded-lg border border-black/[0.08] bg-[#fafafa] px-3 py-2 text-sm text-[#1d1d1f] outline-none focus:border-[#0071e3]/40"
              />
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-[#86868b]">R$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={z.valor > 0 ? String(z.valor).replace(".", ",") : ""}
                  onChange={(e) => {
                    const v = parsePrecoBrasileiro(e.target.value);
                    const next = [...value];
                    next[idx] = { ...z, valor: v ?? 0 };
                    onChange(next);
                  }}
                  placeholder="0,00"
                  className="w-24 rounded-lg border border-black/[0.08] bg-[#fafafa] px-3 py-2 text-sm tabular-nums text-[#1d1d1f] outline-none focus:border-[#0071e3]/40"
                />
                <button
                  type="button"
                  onClick={() => onChange(value.filter((x) => x.id !== z.id))}
                  className="rounded-lg px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Remover
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] leading-relaxed text-[#86868b]">
        Se houver só uma taxa, o cliente não precisa escolher. Com várias, ele escolhe a região no carrinho antes de enviar o pedido.
      </p>
    </div>
  );
}
