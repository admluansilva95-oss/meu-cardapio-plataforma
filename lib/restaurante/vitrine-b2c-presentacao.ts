import type { Prato } from "@/types";

/** Corrige typos comuns em textos exibidos ao cliente final (OCR, colagem, cadastro). */
export function corrigirRotuloVitrineB2C(texto: string): string {
  return texto
    .replace(/\bCerdipio\b/gi, "Cardápio")
    .replace(/\bCardipio\b/gi, "Cardápio")
    .replace(/\bCard[aá]pio p[uú]blico\b/gi, "Cardápio público")
    .replace(/\bWhatsAp\b/gi, "WhatsApp")
    .replace(/\bKarthan\b/gi, "Kanban")
    .replace(/\bKanban de pedidos\b/gi, "esteira de pedidos");
}

const COPY_PLANO_SAAS =
  /esteira\s+kanban|kanban\s+de\s+pedidos|at[eé]\s+\d+\s+pedidos\s+por\s+m[eê]s|pedidos\s+ilimitados|gest[aã]o\s+de\s+software|upgrade\s+de\s+plano|url\s+personalizada|suporte\s+priorit[aá]rio|assinatura\s+mensal/i;

function nomePareceItemPlanoSaaS(nome: string): boolean {
  const n = nome.trim();
  if (!n) return false;
  if (/^plano\s+(essencial|premium)\b/i.test(n)) return true;
  if (/^(essencial|premium)$/i.test(n)) return true;
  return false;
}

function descricaoPareceCopyPlanoSaaS(descricao: string | null | undefined): boolean {
  const d = descricao?.trim() ?? "";
  if (!d) return false;
  return COPY_PLANO_SAAS.test(d);
}

/** Item de cardápio com copy explícita de plano/assinatura — ocultar só na vitrine B2C. */
export function isConteudoSaaSVitrine(prato: Pick<Prato, "nome" | "descricao" | "categoria" | "preco">): boolean {
  if (nomePareceItemPlanoSaaS(prato.nome) || descricaoPareceCopyPlanoSaaS(prato.descricao)) {
    return true;
  }
  const precoPlano =
    Math.abs(prato.preco - 49.9) < 0.01 || Math.abs(prato.preco - 89.9) < 0.01;
  if (
    precoPlano &&
    (nomePareceItemPlanoSaaS(prato.nome) || descricaoPareceCopyPlanoSaaS(prato.descricao))
  ) {
    return true;
  }
  return false;
}

export function isCategoriaSaaSVitrine(categoria: string): boolean {
  const c = categoria.trim();
  if (!c) return false;
  return /^planos?(\s|$)/i.test(c) || /^(essencial|premium)$/i.test(c);
}

/**
 * Pratos para renderização na vitrine: apenas o que veio da API por slug,
 * ocultando itens claramente de plano/assinatura (sem inventar produtos).
 */
export function resolverPratosExibicaoVitrine(pratos: Prato[]): Prato[] {
  return pratos.filter((p) => !isConteudoSaaSVitrine(p));
}

export function filtrarCategoriasVitrineB2C(categorias: string[] | null | undefined): string[] | null {
  if (!categorias?.length) return categorias ?? null;
  const filtradas = categorias.filter((c) => !isCategoriaSaaSVitrine(c));
  return filtradas.length > 0 ? filtradas : null;
}

export function aplicarCopyVitrineB2CPrato(prato: Prato): Prato {
  return {
    ...prato,
    nome: corrigirRotuloVitrineB2C(prato.nome),
    descricao: prato.descricao ? corrigirRotuloVitrineB2C(prato.descricao) : prato.descricao,
    categoria: prato.categoria ? corrigirRotuloVitrineB2C(prato.categoria) : prato.categoria,
  };
}
