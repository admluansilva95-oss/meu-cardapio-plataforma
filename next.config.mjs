import fs from "node:fs";
import path from "node:path";

/**
 * Igual à ideia em `tests/e2e/fixtures/load-env-files.ts`: preenche `undefined`,
 * e permite `.env.e2e` substituir placeholders vazios das chaves públicas do Supabase.
 */
function shouldApplyMergedEnvKey(key, newVal) {
  const cur = process.env[key];
  if (cur === undefined) return true;
  if (
    (key === "NEXT_PUBLIC_SUPABASE_URL" || key === "NEXT_PUBLIC_SUPABASE_ANON_KEY") &&
    !String(cur).trim() &&
    String(newVal).trim()
  ) {
    return true;
  }
  return false;
}

/**
 * O Next só carrega `.env`, `.env.local`, `.env.development*`, etc. — não `.env.e2e`.
 * Funde `.env.e2e` em `process.env` para `npm run dev` (manual ou `reuseExistingServer`)
 * ver `NEXT_PUBLIC_*` no bundle.
 *
 * **Não** usar `NODE_ENV !== "production"`: o Next pode avaliar este ficheiro com
 * `NODE_ENV === "production"` mesmo durante `next dev`, o que impedia o merge.
 * Em `vercel build` / runtime, `VERCEL=1` — não ler ficheiros locais `.env.e2e`.
 */
function mergeOptionalNonStandardEnvFiles() {
  const relativePaths = [
    ".env.e2e",
    path.join("tests", "e2e", ".env.e2e"),
  ];
  for (const name of relativePaths) {
    const filePath = path.join(process.cwd(), name);
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, "utf8");
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (shouldApplyMergedEnvKey(key, val)) {
        process.env[key] = val;
      }
    }
  }
}

const PUBLIC_SUPABASE_KEYS = new Set(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]);

/**
 * Garante `NEXT_PUBLIC_SUPABASE_*` em `process.env` **antes** de ler `publicSupabaseUrl`
 * (e antes do bloco `env` abaixo). O Next pode avaliar `next.config` cedo demais em relação
 * ao carregamento automático de `.env.local`; o Playwright também injeta estas variáveis no
 * filho, mas o merge aqui alinha `next dev` manual com o mesmo trio de ficheiros que
 * `tests/e2e/fixtures/load-env-files.ts` (primeiro valor não vazio por chave, depois sobrepõe
 * `process.env` para vencer placeholders no shell).
 */
function mergePublicSupabaseFromStandardEnvFiles() {
  const relativePaths = [".env.local", ".env.e2e", path.join("tests", "e2e", ".env.e2e")];
  /** @type {Map<string, string>} */
  const picked = new Map();
  for (const name of relativePaths) {
    const filePath = path.join(process.cwd(), name);
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, "utf8");
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!PUBLIC_SUPABASE_KEYS.has(key)) continue;
      if (picked.has(key)) continue;
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (val.trim()) picked.set(key, val);
    }
  }
  for (const [key, val] of picked) {
    process.env[key] = val;
  }
}

if (process.env.VERCEL !== "1") {
  mergeOptionalNonStandardEnvFiles();
  mergePublicSupabaseFromStandardEnvFiles();
}

/** @type {import('next').NextConfig} */
const buildId =
  process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
  process.env.BUILD_ID?.trim() ||
  `local-${process.env.npm_package_version || "0.1.0"}`;

const publicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const publicSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

const nextConfig = {
  /** Playwright usa 127.0.0.1; sem isto o HMR falha e o cliente pode ficar inconsistente no dev. */
  allowedDevOrigins: ["127.0.0.1"],
  env: {
    /** Comparado com `GET /api/build-info` para reload após novo deploy. */
    NEXT_PUBLIC_BUILD_ID: buildId,
    /** Garante inlining no cliente após merges de `.env.*` / ficheiros E2E (ver topo deste ficheiro). */
    ...(publicSupabaseUrl && publicSupabaseAnonKey
      ? {
          NEXT_PUBLIC_SUPABASE_URL: publicSupabaseUrl,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: publicSupabaseAnonKey,
        }
      : {}),
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'celeitoroast.netlify.app',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        port: '',
        pathname: '/storage/**',
      },
    ],
  },
};

export default nextConfig;