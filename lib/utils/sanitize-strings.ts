/**
 * Utilitários para textos que entram em **ByteString** (Latin-1): cabeçalhos HTTP,
 * alguns caminhos/cookies em runtimes Chromium/Electron, multipart do `fetch`, etc.
 */

/** Remove code points > U+00FF (não cabem em ByteString / Latin-1). */
export function latin1SafeString(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 255) out += s[i]!;
  }
  return out;
}

/**
 * Remove artefatos invisíveis comuns de rich-text / colagem (Word, iOS, Google Docs):
 * zero-width, marcas de direção, joiners, BOM após NFKC, soft hyphen, grapheme joiner, etc.
 */
export function stripInvisibleFormatting(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/\uFEFF/g, "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064]/g, "")
    .replace(/[\u2066-\u2069]/g, "") /* isolates bidi supplement */
    .replace(/\u180E/g, "") /* Mongolian vowel separator (legado) */
    .replace(/\u00AD/g, "") /* soft hyphen */
    .replace(/\u034F/g, ""); /* COMBINING GRAPHEME JOINER */
}

/**
 * Texto livre do usuário: bullets, travessões, aspas tipográficas, espaços especiais,
 * guillemets, vírgulas tipográficas, depois só Latin-1 (compatível com cabeçalhos / wire estrito).
 */
export function sanitizeUserFreeText(s: string): string {
  const stripped = stripInvisibleFormatting(s);
  const t = stripped
    .replace(/[\u2000-\u200A\u202F\u205F]/g, " ")
    .replace(/[\u2022\u2023\u2024\u2025\u2043\u204C\u204D\u2219\u25CF\u25AA\u25E6\u29BB\u30FB]/g, "-")
    .replace(/\u2013|\u2014|\u2012|\u2010|\u2011|\u2212/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2E42]/g, '"')
    .replace(/[\u00AB\u00BB\u2039\u203A]/g, '"')
    .replace(/\u2E41/g, ","); /* exclamation comma → ASCII */
  return latin1SafeString(t);
}

/** Paths de Storage: só Latin-1 + barras normalizadas (evita ByteString no cliente). */
export function normalizeLatin1StoragePath(path: string): string {
  return latin1SafeString(path).replace(/\/{2,}/g, "/").replace(/^\/+/, "");
}

/**
 * Chaves cujo valor é credencial / token: não podem passar por `sanitizeUserFreeText` + Latin-1,
 * senão caracteres fora de U+00FF (ex.: emoji em senha) são removidos e o Supabase Auth recebe
 * uma palavra-passe errada → "Invalid login credentials".
 * O `JSON.stringify` escapa Unicode em `\uXXXX` no fio — o resultado continua compatível com ByteString.
 * (Relevante para login real nos E2E com `E2E_PASSWORD` fora de Latin-1.)
 */
const JSON_WIRE_PRESERVE_UTF8_STRING_KEYS = new Set([
  "password",
  "new_password",
  "refresh_token",
  "access_token",
  "token_hash",
]);

function sanitizeWireSecretString(s: string): string {
  return stripInvisibleFormatting(s);
}

export function jsonStringifyLatin1Wire(value: unknown): string {
  return JSON.stringify(value, (key, v) => {
    if (typeof v !== "string") return v;
    if (key !== "" && JSON_WIRE_PRESERVE_UTF8_STRING_KEYS.has(key)) {
      return sanitizeWireSecretString(v);
    }
    return sanitizeUserFreeText(v);
  });
}

export function deepSanitizeStringsForWire(input: unknown): unknown {
  if (typeof input === "string") return sanitizeUserFreeText(input);
  if (input == null || typeof input === "number" || typeof input === "boolean") return input;
  if (Array.isArray(input)) return input.map(deepSanitizeStringsForWire);
  if (typeof input === "object") {
    const src = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) {
      const sk = latin1SafeString(k);
      if (!sk) continue;
      if (typeof v === "string" && JSON_WIRE_PRESERVE_UTF8_STRING_KEYS.has(sk)) {
        out[sk] = sanitizeWireSecretString(v);
      } else {
        out[sk] = deepSanitizeStringsForWire(v);
      }
    }
    return out;
  }
  return input;
}

/**
 * Entrada genérica para corpo JSON ou campos que precisam ir como Latin-1:
 * - `string` → `sanitizeUserFreeText`
 * - objeto/array → `deepSanitizeStringsForWire` + `jsonStringifyLatin1Wire`
 */
export function sanitizeForWire(value: string | object): string {
  if (typeof value === "string") return sanitizeUserFreeText(value);
  return jsonStringifyLatin1Wire(deepSanitizeStringsForWire(value));
}

/** @deprecated Use `sanitizeUserFreeText` — mantido para compat com imports antigos. */
export const expandLatin1UserText = sanitizeUserFreeText;
