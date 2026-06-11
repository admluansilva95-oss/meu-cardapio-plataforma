import { expandLatin1UserText, latin1SafeString } from "@/lib/restaurante/json-latin1-wire";
import { parseTaxasEntregaZonas, type TaxaEntregaZona } from "@/lib/restaurante/taxas-entrega-zonas";

export type LinhaItemPedido = { pratoId: string; quantidade: number };

export type PratoPrecoRow = {
  id: string;
  nome: string;
  preco: number;
  status: string;
  categoria: string | null;
};

const MAX_LINHAS = 60;
const MAX_QTD = 99;

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function toMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseLinhasBody(raw: unknown): LinhaItemPedido[] | null {
  if (!Array.isArray(raw)) return null;
  const out: LinhaItemPedido[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const pratoId = typeof o.pratoId === "string" ? o.pratoId.trim() : "";
    const qRaw = o.quantidade;
    const quantidade =
      typeof qRaw === "number" && Number.isInteger(qRaw)
        ? qRaw
        : typeof qRaw === "string"
          ? Number.parseInt(qRaw, 10)
          : NaN;
    if (!isUuid(pratoId) || !Number.isFinite(quantidade) || quantidade < 1 || quantidade > MAX_QTD) {
      return null;
    }
    out.push({ pratoId, quantidade });
  }
  if (out.length === 0 || out.length > MAX_LINHAS) return null;
  return out;
}

export function parseLinhasPedidoVitrine(body: { linhas?: unknown }): LinhaItemPedido[] | null {
  return parseLinhasBody(body.linhas);
}

export function sanitizeObservacoesVitrine(raw: string, maxLen: number): string {
  const t = expandLatin1UserText(raw.length > maxLen ? raw.slice(0, maxLen) : raw);
  return latin1SafeString(t).slice(0, maxLen);
}

export function computeTaxaEntregaServidor(opts: {
  tipoEntrega: "entrega" | "retirada";
  taxaFixa: number | null;
  zonas: TaxaEntregaZona[] | null;
  zonaEntregaId: string | null;
}): { ok: true; valor: number } | { ok: false; error: string } {
  if (opts.tipoEntrega === "retirada") return { ok: true, valor: 0 };
  const zonas = opts.zonas;
  if (zonas && zonas.length > 0) {
    if (zonas.length === 1) {
      return { ok: true, valor: toMoney(zonas[0].valor) };
    }
    const zid = opts.zonaEntregaId?.trim() ?? "";
    if (!isUuid(zid)) {
      return { ok: false, error: "Selecione a região de entrega (bairro) válida." };
    }
    const z = zonas.find((x) => x.id === zid);
    if (!z) return { ok: false, error: "Região de entrega inválida para este restaurante." };
    return { ok: true, valor: toMoney(z.valor) };
  }
  const t = opts.taxaFixa;
  if (t != null && t > 0) return { ok: true, valor: toMoney(t) };
  return { ok: true, valor: 0 };
}

export function computeTotaisPedidoVitrine(opts: {
  linhas: LinhaItemPedido[];
  pratosPorId: Map<string, PratoPrecoRow>;
  tipoEntrega: "entrega" | "retirada";
  taxaFixa: number | null;
  zonasRaw: unknown;
  zonaEntregaId: string | null;
}):
  | {
      ok: true;
      subtotal: number;
      taxa: number;
      total: number;
      linhasItensTexto: string[];
    }
  | { ok: false; error: string } {
  const zonas = parseTaxasEntregaZonas(opts.zonasRaw);
  const tax = computeTaxaEntregaServidor({
    tipoEntrega: opts.tipoEntrega,
    taxaFixa: opts.taxaFixa,
    zonas,
    zonaEntregaId: opts.zonaEntregaId,
  });
  if (!tax.ok) return tax;

  let subtotal = 0;
  const linhasItensTexto: string[] = [];
  const seen = new Set<string>();

  for (const { pratoId, quantidade } of opts.linhas) {
    if (seen.has(pratoId)) {
      return { ok: false, error: "Lista de itens contém prato duplicado." };
    }
    seen.add(pratoId);
    const p = opts.pratosPorId.get(pratoId);
    if (!p || p.status !== "ativo") {
      return { ok: false, error: "Um ou mais itens não estão disponíveis no cardápio." };
    }
    const unit = toMoney(Number(p.preco));
    if (!Number.isFinite(unit) || unit < 0) {
      return { ok: false, error: "Preço de item inválido no servidor." };
    }
    const linhaSub = toMoney(unit * quantidade);
    subtotal += linhaSub;
    const nome = expandLatin1UserText(p.nome.trim()) || "Item";
    linhasItensTexto.push(`${quantidade}x ${nome} (${unit.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} cada)`);
  }

  subtotal = toMoney(subtotal);
  const taxaAplicada = opts.linhas.length > 0 ? tax.valor : 0;
  const total = toMoney(subtotal + taxaAplicada);
  return { ok: true, subtotal, taxa: taxaAplicada, total, linhasItensTexto };
}
