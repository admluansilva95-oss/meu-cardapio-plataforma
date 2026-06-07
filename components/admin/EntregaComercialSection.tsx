"use client";

import type { EntregaModo } from "@/types";
import type { TaxaEntregaZona } from "@/lib/restaurante/taxas-entrega-zonas";
import {
  normalizarPrecoCampoAoSair,
  parsePrecoBrasileiro,
  sanitizePrecoBrInput,
} from "@/lib/restaurante/preco-input";
import { TaxasZonasForm } from "@/components/admin/TaxasZonasForm";
import { IosToggle } from "@/components/ui/IosToggle";

export function EntregaComercialSection(props: {
  entregaModo: EntregaModo;
  onEntregaModo: (m: EntregaModo) => void;
  taxaFixaTexto: string;
  onTaxaFixaTexto: (s: string) => void;
  zonas: TaxaEntregaZona[];
  onZonas: (z: TaxaEntregaZona[]) => void;
  retiradaBalcao: boolean;
  onRetiradaBalcao: (v: boolean) => void;
}) {
  const {
    entregaModo,
    onEntregaModo,
    taxaFixaTexto,
    onTaxaFixaTexto,
    zonas,
    onZonas,
    retiradaBalcao,
    onRetiradaBalcao,
  } = props;

  return (
    <div className="rounded-3xl border border-zinc-100 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-zinc-900">Entrega</h3>
          <p className="mt-1 max-w-md text-sm leading-relaxed text-zinc-500">
            Defina como a taxa aparece no cardápio e no total do pedido.
          </p>
        </div>
      </div>

      <div className="mt-8 flex w-full max-w-md rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-1">
        {(["fixa", "zonas"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onEntregaModo(m)}
            className={[
              "flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all",
              entregaModo === m
                ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/80"
                : "text-zinc-500 hover:text-zinc-800",
            ].join(" ")}
          >
            {m === "fixa" ? "Taxa fixa" : "Por bairro"}
          </button>
        ))}
      </div>

      {entregaModo === "fixa" ? (
        <div className="mt-8 space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Valor da entrega (R$)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={taxaFixaTexto}
            onChange={(e) => onTaxaFixaTexto(sanitizePrecoBrInput(e.target.value))}
            onBlur={() =>
              onTaxaFixaTexto(
                taxaFixaTexto.trim() === "" ? "" : normalizarPrecoCampoAoSair(taxaFixaTexto),
              )
            }
            placeholder="0,00"
            className="w-full max-w-xs rounded-2xl border border-zinc-200 bg-zinc-50/50 px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-zinc-900"
          />
          <p className="text-xs leading-relaxed text-zinc-500">
            Deixe em branco ou 0,00 se não cobrar entrega. Ponto no teclado vira vírgula.
          </p>
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-100 bg-zinc-50/50 p-1 shadow-sm transition-all duration-300 ease-out">
          <TaxasZonasForm value={zonas} onChange={onZonas} adicionarLabel="+ Adicionar bairro" />
        </div>
      )}

      <div className="mt-10 flex items-center justify-between gap-4 rounded-2xl border border-zinc-100 bg-zinc-50/50 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900">Retirada no balcão</p>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
            O cliente pode optar por retirar no local, sem taxa de entrega no total.
          </p>
        </div>
        <IosToggle
          checked={retiradaBalcao}
          onChange={onRetiradaBalcao}
          aria-label="Ativar retirada no balcão"
        />
      </div>
    </div>
  );
}

export function taxaFixaInicialDeRestaurante(
  taxa_entrega: number | null | undefined,
  zonas: TaxaEntregaZona[] | null | undefined,
): string {
  if (taxa_entrega != null && taxa_entrega > 0) {
    return taxa_entrega.toFixed(2).replace(".", ",");
  }
  const z = zonas?.length === 1 ? zonas[0].valor : null;
  if (z != null && z > 0) return z.toFixed(2).replace(".", ",");
  return "";
}

/** Valor numérico da taxa fixa para persistir em `taxa_entrega` quando modo fixa. */
export function taxaFixaParaPersistir(texto: string): number | null {
  const n = parsePrecoBrasileiro(texto);
  if (n == null || n <= 0) return null;
  return Math.round(n * 100) / 100;
}
