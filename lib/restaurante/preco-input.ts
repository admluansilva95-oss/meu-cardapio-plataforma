/** Campo de preço no painel (pt-BR): vírgula decimal; ponto vira vírgula. */

export function parsePrecoBrasileiro(raw: string): number | null {
  const t = raw.trim().replace(/R\$\s?/gi, "");
  if (!t) return null;
  if (t.includes(",")) {
    const parts = t.split(",");
    if (parts.length !== 2) return null;
    const intPart = parts[0].replace(/\./g, "").replace(/\D/g, "");
    const decPart = parts[1].replace(/\D/g, "");
    if (!intPart && !decPart) return null;
    const n = Number(`${intPart || "0"}.${decPart || "0"}`);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100) / 100;
  }
  const normalized = t.replace(/[^\d.]/g, "");
  if (!normalized) return null;
  const lastDot = normalized.lastIndexOf(".");
  if (lastDot === -1) {
    const n = Number(normalized);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  }
  const after = normalized.slice(lastDot + 1);
  const before = normalized.slice(0, lastDot);
  if (/^\d{1,2}$/.test(after) && before.includes(".")) {
    const intPart = before.replace(/\./g, "");
    const n = Number(`${intPart}.${after}`);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100) / 100;
  }
  const digits = normalized.replace(/\./g, "");
  const n = Number(digits);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function formatPrecoBrFromNumber(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

/**
 * Sanitiza o texto enquanto o usuário digita: ponto → vírgula, uma parte decimal
 * com até 2 dígitos; mantém vírgula final para continuar digitando centavos.
 */
export function sanitizePrecoBrInput(raw: string): string {
  const dotAsComma = raw.replace(/\./g, ",");
  const parts = dotAsComma.split(",");
  const intPart = (parts[0] ?? "").replace(/\D/g, "");
  const mergedDecimals = parts.slice(1).join("").replace(/\D/g, "").slice(0, 2);
  const endsWithSep = /[.,]\s*$/.test(raw);

  if (parts.length === 1) return intPart;

  if (mergedDecimals.length === 0 && endsWithSep) {
    return intPart ? `${intPart},` : "";
  }
  if (mergedDecimals.length > 0) {
    return `${intPart.length > 0 ? intPart : "0"},${mergedDecimals}`;
  }
  return intPart;
}

/** Ao sair do campo: normaliza para duas casas decimais com vírgula. */
export function normalizarPrecoCampoAoSair(raw: string): string {
  const n = parsePrecoBrasileiro(raw);
  if (n == null) return raw.trim();
  return formatPrecoBrFromNumber(n);
}
