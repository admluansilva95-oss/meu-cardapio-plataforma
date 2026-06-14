import fs from "node:fs";
import path from "node:path";

/**
 * Carrega variáveis de ambiente para o processo do Playwright (Node), sem dependência de `dotenv`.
 * Não sobrescreve chaves já definidas no ambiente (CI / shell).
 */
export function loadLocalEnvFiles(): void {
  /** Ordem: primeiro ficheiro define a chave; os seguintes só preenchem `undefined` (como no Playwright/CI). */
  const relativePaths = [
    ".env.local",
    ".env.e2e",
    /** Muitos exemplos vivem em `tests/e2e/`; o Next não lê este path sozinho. */
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
