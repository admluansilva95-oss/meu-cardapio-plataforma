import fs from "node:fs";
import path from "node:path";

const PUBLIC_SUPABASE_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

/** Mesma ordem em `loadLocalEnvFiles` — primeiro valor não vazio por chave. */
const E2E_ENV_FILE_PATHS = [".env.local", ".env.e2e", path.join("tests", "e2e", ".env.e2e")] as const;

function parseEnvLine(rawLine: string): { key: string; val: string } | null {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) return null;
  const eq = line.indexOf("=");
  if (eq <= 0) return null;
  const key = line.slice(0, eq).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  let val = line.slice(eq + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  return { key, val };
}

/**
 * O Next.js dá **precedência** a `process.env` já definido (ex.: exports no zsh) sobre o
 * `.env.local` no disco. O `webServer` do Playwright faz `env: { ...process.env }`, logo
 * placeholders no shell impedem o ficheiro de corrigir o `next dev` filho → login E2E
 * com erro tipo “no api key”. Para estas duas chaves públicas, o **primeiro** valor
 * não vazio nos mesmos ficheiros que `loadLocalEnvFiles` **substitui sempre** o ambiente.
 */
function collectPublicSupabaseFromFiles(
  relativePaths: readonly string[],
): Partial<Record<(typeof PUBLIC_SUPABASE_KEYS)[number], string>> {
  const picked: Partial<Record<(typeof PUBLIC_SUPABASE_KEYS)[number], string>> = {};
  for (const name of relativePaths) {
    const filePath = path.join(process.cwd(), name);
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, "utf8");
    for (const rawLine of text.split("\n")) {
      const parsed = parseEnvLine(rawLine);
      if (!parsed) continue;
      const { key, val } = parsed;
      if (!PUBLIC_SUPABASE_KEYS.includes(key as (typeof PUBLIC_SUPABASE_KEYS)[number])) continue;
      const k = key as (typeof PUBLIC_SUPABASE_KEYS)[number];
      if (!val.trim() || picked[k]) continue;
      picked[k] = val;
    }
  }
  return picked;
}

function applyPublicSupabaseFromFilesOverridingShell(relativePaths: readonly string[]): void {
  const picked = collectPublicSupabaseFromFiles(relativePaths);
  for (const k of PUBLIC_SUPABASE_KEYS) {
    const v = picked[k];
    if (v?.trim()) process.env[k] = v;
  }
}

/**
 * Valores públicos do Supabase lidos dos ficheiros E2E (primeiro não vazio por chave).
 * Usar no `webServer.env` do Playwright **depois** de `...process.env` para o `next dev` filho
 * receber sempre o URL/chave do disco, mesmo quando o shell ou o CI têm placeholders.
 */
export function getPublicSupabaseEnvFromFiles(): Record<string, string> {
  const picked = collectPublicSupabaseFromFiles(E2E_ENV_FILE_PATHS);
  const out: Record<string, string> = {};
  for (const k of PUBLIC_SUPABASE_KEYS) {
    const v = picked[k]?.trim();
    if (v) out[k] = v;
  }
  return out;
}

function shouldApplyEnvKey(key: string, newVal: string): boolean {
  const cur = process.env[key];
  if (cur === undefined) return true;
  if (
    (key === "NEXT_PUBLIC_SUPABASE_URL" || key === "NEXT_PUBLIC_SUPABASE_ANON_KEY") &&
    !String(cur).trim() &&
    newVal.trim()
  ) {
    return true;
  }
  return false;
}

/**
 * Carrega variáveis de ambiente para o processo do Playwright (Node), sem dependência de `dotenv`.
 * Não sobrescreve chaves já definidas no ambiente (CI / shell), exceto placeholders vazios
 * `NEXT_PUBLIC_SUPABASE_*` que `.env.e2e` pode preencher.
 */
export function loadLocalEnvFiles(): void {
  const relativePaths = E2E_ENV_FILE_PATHS;
  for (const name of relativePaths) {
    const filePath = path.join(process.cwd(), name);
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, "utf8");
    for (const rawLine of text.split("\n")) {
      const parsed = parseEnvLine(rawLine);
      if (!parsed) continue;
      const { key, val } = parsed;
      if (shouldApplyEnvKey(key, val)) {
        process.env[key] = val;
      }
    }
  }
  applyPublicSupabaseFromFilesOverridingShell(relativePaths);
}
