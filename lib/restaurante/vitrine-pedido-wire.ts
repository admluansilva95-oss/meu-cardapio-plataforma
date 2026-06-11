import { sanitizeUserFreeText } from "@/lib/utils/sanitize-strings";

/**
 * Identificadores (UUID, slug em URL): só ASCII imprimível — remove zero-width / colagens
 * que quebram `eq("id", …)` no PostgREST **sem** passar por `sanitizeUserFreeText` (NFKC).
 */
function asciiWireId(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "number" && Number.isFinite(raw)) return String(Math.trunc(raw));
  if (typeof raw !== "string") return "";
  return raw.normalize("NFC").trim().replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, "");
}

const FORMAS = new Set(["dinheiro", "pix", "cartao_debito", "cartao_credito"]);
const TIPOS_ENTREGA = new Set(["retirada", "entrega"]);

/**
 * Corpo JSON para `POST /api/pedidos/vitrine`: higieniza só texto livre;
 * `restauranteId` / `linhas[].pratoId` / `zonaEntregaId` ficam estáveis (wire seguro).
 */
export function buildVitrinePedidoWirePayload(payload: unknown): Record<string, unknown> {
  const p = payload != null && typeof payload === "object" ? (payload as Record<string, unknown>) : {};

  const restauranteId = asciiWireId(p.restauranteId);
  const cliente = typeof p.cliente === "string" ? sanitizeUserFreeText(p.cliente).trim() : "";
  const telefone = typeof p.telefone === "string" ? sanitizeUserFreeText(p.telefone).trim() : "";

  const fp = typeof p.formaPagamento === "string" ? p.formaPagamento.trim() : "";
  const formaPagamento = FORMAS.has(fp) ? fp : "";

  const te = typeof p.tipoEntrega === "string" ? p.tipoEntrega.trim() : "";
  const tipoEntrega = TIPOS_ENTREGA.has(te) ? te : "entrega";

  const z = p.zonaEntregaId;
  const zonaEntregaId =
    z === null || z === undefined ? null : (asciiWireId(z) || null);

  const obs = typeof p.observacoes === "string" ? sanitizeUserFreeText(p.observacoes) : "";

  const linhasIn = Array.isArray(p.linhas) ? p.linhas : [];
  const linhas: Array<{ pratoId: string; quantidade: number }> = [];
  for (const row of linhasIn) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const pratoId = asciiWireId(r.pratoId);
    const qRaw = r.quantidade;
    const q = typeof qRaw === "number" ? qRaw : Number(qRaw);
    const quantidade = Number.isFinite(q) ? Math.max(1, Math.min(999, Math.floor(q))) : 0;
    if (pratoId && quantidade > 0) linhas.push({ pratoId, quantidade });
  }

  return {
    restauranteId,
    cliente,
    telefone,
    formaPagamento,
    linhas,
    zonaEntregaId,
    observacoes: obs,
    tipoEntrega,
  };
}
