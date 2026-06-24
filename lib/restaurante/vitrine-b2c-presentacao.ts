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

const PADROES_TEXTO_SAAS =
  /plano\s+(essencial|premium)|assinatura|R\$\s*49[,.]90|R\$\s*89[,.]90|esteira\s+kanban|kanban\s+de\s+pedidos|at[eé]\s+\d+\s+pedidos\s+por\s+m[eê]s|pedidos\s+ilimitados|gest[aã]o\s+de\s+software|painel\s+admin|card[aá]pio\s+digital\s+profissional|stripe|saas|upgrade\s+de\s+plano|url\s+personalizada|suporte\s+priorit[aá]rio/i;

function textoPareceSaaS(texto: string | null | undefined): boolean {
  const t = texto?.trim() ?? "";
  if (!t) return false;
  return PADROES_TEXTO_SAAS.test(t);
}

/** Item de cardápio com copy de plano/assinatura do SaaS — não deve aparecer na vitrine B2C. */
export function isConteudoSaaSVitrine(prato: Pick<Prato, "nome" | "descricao" | "categoria" | "preco">): boolean {
  if (textoPareceSaaS(prato.nome) || textoPareceSaaS(prato.descricao) || textoPareceSaaS(prato.categoria)) {
    return true;
  }
  const nome = prato.nome.trim().toLowerCase();
  if (nome === "essencial" || nome === "premium" || nome.startsWith("plano ")) return true;
  if (Math.abs(prato.preco - 49.9) < 0.01 || Math.abs(prato.preco - 89.9) < 0.01) {
    if (textoPareceSaaS(prato.descricao) || /plano|assinatura|kanban|pedidos\s+por/i.test(prato.nome)) {
      return true;
    }
  }
  return false;
}

export function isCategoriaSaaSVitrine(categoria: string): boolean {
  return textoPareceSaaS(categoria);
}

/**
 * Pratos para renderização na vitrine: apenas o que veio da API por slug,
 * ocultando itens com copy de plano/assinatura do SaaS (sem inventar produtos).
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
