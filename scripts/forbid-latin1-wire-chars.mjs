#!/usr/bin/env node
/**
 * Trava de repositório: falha se U+2022 (bullet) ou U+FEFF (BOM) aparecerem em código-fonte
 * sob app/, lib/, components/, proxy.ts — zonas onde strings podem ir parar ao wire por engano.
 *
 * Uso: `node scripts/forbid-latin1-wire-chars.mjs` ou `npm run check:wire-latin1`
 */
import fs from "node:fs";
import path from "node:path";

const BULLET = "\u2022";
const BOM = "\uFEFF";
const ROOT = process.cwd();
const TARGETS = ["app", "lib", "components", path.join(ROOT, "proxy.ts")];

const hits = [];

function scanFile(abs) {
  let text;
  try {
    text = fs.readFileSync(abs, "utf8");
  } catch {
    return;
  }
  if (text.includes(BOM)) {
    hits.push(`${abs}: contém BOM (U+FEFF)`);
  }
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.includes(BULLET)) {
      hits.push(`${abs}:${i + 1}: contém U+2022 (bullet) — use ASCII ou mencione "U+2022" no comentário sem o glifo`);
    }
  });
}

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".next") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkDir(p);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(ent.name)) scanFile(p);
  }
}

for (const t of TARGETS) {
  const abs = path.isAbsolute(t) ? t : path.join(ROOT, t);
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) scanFile(abs);
  else if (fs.existsSync(abs)) walkDir(abs);
}

if (hits.length) {
  console.error("[check:wire-latin1] Caracteres proibidos no código:\n" + hits.join("\n"));
  process.exit(1);
}
console.log("[check:wire-latin1] OK — sem U+2022 / BOM nas pastas verificadas.");
