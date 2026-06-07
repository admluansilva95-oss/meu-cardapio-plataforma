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
 * `JSON.stringify` recursivo que, em cada string, remove code points > U+00FF.
 * Alguns navegadores / extensões tratam partes do `fetch` com `credentials: "include"`
 * como Latin-1 (ByteString); caracteres como • (U+2022) ou traços tipográficos (U+2013)
 * no corpo ou em metadados podem disparar `TypeError: Cannot convert argument to a ByteString`.
 *
 * Mantém acentos Latin-1 comuns (ex.: á, ç, é) porque ficam ≤ 255.
 */
export function jsonStringifyLatin1Wire(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (typeof v !== "string") return v;
    return latin1SafeString(v);
  });
}
