import fs from "node:fs";
import path from "node:path";

/**
 * O Next só carrega `.env`, `.env.local`, `.env.development*`, etc. — não `.env.e2e`.
 * Em desenvolvimento, fundir os mesmos paths que `tests/e2e/fixtures/load-env-files.ts`
 * para `npm run dev` (manual ou `reuseExistingServer`) expor `NEXT_PUBLIC_*` ao bundle.
 * Não sobrescreve chaves já definidas (shell / `.env.local` já processado pelo Next).
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
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  }
}

if (process.env.NODE_ENV !== "production") {
  mergeOptionalNonStandardEnvFiles();
}

/** @type {import('next').NextConfig} */
const buildId =
  process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
  process.env.BUILD_ID?.trim() ||
  `local-${process.env.npm_package_version || "0.1.0"}`;

const nextConfig = {
  /** Playwright usa 127.0.0.1; sem isto o HMR falha e o cliente pode ficar inconsistente no dev. */
  allowedDevOrigins: ["127.0.0.1"],
  env: {
    /** Comparado com `GET /api/build-info` para reload após novo deploy. */
    NEXT_PUBLIC_BUILD_ID: buildId,
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