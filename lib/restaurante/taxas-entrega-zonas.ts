export type TaxaEntregaZona = { id: string; nome: string; valor: number };

function isZona(v: unknown): v is TaxaEntregaZona {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.nome === "string" &&
    typeof o.valor === "number" &&
    Number.isFinite(o.valor) &&
    o.valor >= 0
  );
}

export function novaTaxaZonaId(): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `z-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function parseTaxasEntregaZonas(raw: unknown): TaxaEntregaZona[] | null {
  if (!raw) return null;
  if (!Array.isArray(raw)) return null;
  const list = raw.filter(isZona).map((z) => ({
    id: z.id,
    nome: z.nome.trim(),
    valor: Math.round(z.valor * 100) / 100,
  }));
  return list.length ? list : null;
}

export function validarTaxasZonas(zonas: TaxaEntregaZona[]): string | null {
  for (let i = 0; i < zonas.length; i++) {
    const z = zonas[i];
    if (!z.nome.trim()) return `Taxa ${i + 1}: informe o nome da região ou bairro.`;
    if (!Number.isFinite(z.valor) || z.valor < 0) return `Taxa ${i + 1}: valor inválido.`;
  }
  return null;
}

/** Taxa única legada → uma zona genérica */
export function zonasFromLegacyTaxa(taxa: number | null | undefined): TaxaEntregaZona[] | null {
  if (taxa == null || taxa <= 0) return null;
  return [{ id: novaTaxaZonaId(), nome: "Entrega", valor: Math.round(taxa * 100) / 100 }];
}
