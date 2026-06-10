/**
 * Normaliza cor para hex #rrggbb (fallback teal).
 * Aceita lixo/Unicode antes do `#` (ex.: bullet colado no cadastro) — evita `ByteString` ao injetar em `style`.
 */
export function normalizeCorTema(cor: string): string {
  const m = cor.match(/#\s*((?:[0-9a-fA-F]{6})|(?:[0-9a-fA-F]{3}))(?![0-9a-fA-F])/i);
  if (!m) return "#0d9488";
  let t = `#${m[1]}`;
  if (t.length === 4) {
    const r = t[1]!;
    const g = t[2]!;
    const b = t[3]!;
    t = `#${r}${r}${g}${g}${b}${b}`;
  }
  return t.toLowerCase();
}
