/**
 * Remove code points > U+00FF (não cabem em ByteString / Latin-1 do `fetch` em alguns runtimes).
 * Mantém acentos Latin-1 comuns (ex.: á, ç, é).
 */
export function latin1SafeString(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 255) out += s[i]!;
  }
  return out;
}

/**
 * Normaliza texto digitado/copiado (Word, iOS) antes de enviar em JSON ou cabeçalhos Latin-1:
 * bullets e travessões viram `-`, aspas “curvas” viram `'`/`"`, reticências tipográficas vêm `...`,
 * depois remove qualquer caractere ainda fora de Latin-1.
 */
export function expandLatin1UserText(s: string): string {
  const t = s
    .replace(/\uFEFF/g, "") /* BOM */
    /* Espaços tipográficos (ex.: `toLocaleString` pt-BR) — fora de Latin-1 e disparam ByteString no Chrome */
    .replace(/[\u2000-\u200A\u202F\u205F]/g, " ")
    /* Bullets / marcadores comuns (Word, Google Docs, iOS) — U+2022 = 8226 */
    .replace(/[\u2022\u2023\u2043\u2219\u25CF\u25AA\u25E6\u29BB\u30FB]/g, "-")
    .replace(/\u2013|\u2014|\u2010|\u2011|\u2212/g, "-") /* – — ‐ ‑ − */
    .replace(/\u2026/g, "...") /* … */
    .replace(/\u00A0/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
  return latin1SafeString(t);
}

/**
 * `JSON.stringify` recursivo: em cada string aplica `expandLatin1UserText` (troca •, travessões,
 * aspas tipográficas, etc.) e remove o que ainda passar de U+00FF — compatível com ByteString no `fetch`.
 */
export function jsonStringifyLatin1Wire(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (typeof v !== "string") return v;
    return expandLatin1UserText(v);
  });
}
