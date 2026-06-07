import type { Prato } from "@/types";

export function parseCardapioCategorias(raw: unknown): string[] {
  if (!raw) return [];
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (t) out.push(t);
  }
  return out;
}

export function validarCardapioCategorias(cats: string[]): string | null {
  if (cats.length > 40) return "Use no máximo 40 categorias.";
  for (let i = 0; i < cats.length; i++) {
    if (cats[i].length > 48) return `Categoria ${i + 1}: no máximo 48 caracteres.`;
  }
  return null;
}

/** Categorias distintas dos pratos (ordenadas), para preencher lista quando o JSON está vazio. */
export function categoriasDistintasDosPratos(pratos: { categoria?: string | null }[]): string[] {
  const set = new Set<string>();
  for (const p of pratos) {
    const t = p.categoria?.trim();
    if (t) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function slugifySecaoCardapio(titulo: string): string {
  const base = titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "secao";
}

/**
 * Monta seções na ordem do cadastro (`cardapio_categorias`), depois inclui categorias dos pratos
 * que ainda não apareceram.
 */
export function ordenarSecoesCardapio(
  cardapio_categorias: string[] | null | undefined,
  pratos: Prato[],
): { titulo: string; lista: Prato[] }[] {
  const ordered = parseCardapioCategorias(cardapio_categorias ?? []);
  const map = new Map<string, Prato[]>();
  for (const p of pratos) {
    const k = p.categoria?.trim() || "Cardápio";
    const arr = map.get(k) ?? [];
    arr.push(p);
    map.set(k, arr);
  }
  for (const [, arr] of map) {
    arr.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }
  const used = new Set<string>();
  const out: { titulo: string; lista: Prato[] }[] = [];
  for (const titulo of ordered) {
    const lista = map.get(titulo);
    if (lista?.length) {
      out.push({ titulo, lista });
      used.add(titulo);
    }
  }
  const restKeys = [...map.keys()].filter((k) => !used.has(k));
  restKeys.sort((a, b) => {
    if (a === "Cardápio" && b !== "Cardápio") return 1;
    if (b === "Cardápio" && a !== "Cardápio") return -1;
    return a.localeCompare(b, "pt-BR");
  });
  for (const titulo of restKeys) {
    const lista = map.get(titulo)!;
    if (lista.length) out.push({ titulo, lista });
  }
  return out;
}
