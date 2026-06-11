import { deepSanitizeStringsForWire, sanitizeUserFreeText } from "@/lib/utils/sanitize-strings";

/**
 * Texto livre antes de gravar em `varchar` / `text` (remove •, tipografia, > Latin-1).
 * Aplica `maxLen` após higienizar para respeitar limites de coluna.
 */
export function sanitizeDbPlainText(raw: string, maxLen?: number): string {
  const t = sanitizeUserFreeText(String(raw ?? "").trim());
  if (maxLen != null && t.length > maxLen) return t.slice(0, maxLen);
  return t;
}

export function sanitizeDbPlainTextNullable(
  raw: string | null | undefined,
  maxLen?: number,
): string | null {
  if (raw == null) return null;
  const s = sanitizeDbPlainText(String(raw), maxLen);
  return s.length > 0 ? s : null;
}

/** JSONB (agenda, zonas): higieniza todas as strings recursivamente. */
export function sanitizeDbJsonDeep<T>(value: T): T {
  return deepSanitizeStringsForWire(value) as T;
}
