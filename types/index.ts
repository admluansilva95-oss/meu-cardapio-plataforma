/**
 * Tipagens centrais do domínio (Supabase / multitenant).
 * Mantenha alinhado com as tabelas `restaurantes` e `pratos`.
 */

export type PratoStatus = "ativo" | "pausado";

export interface Restaurante {
  id: string;
  nome: string;
  slug: string;
  /** Número no formato que o time usar no cadastro (ex.: +55 11 91234-5678) */
  whatsapp: string;
  /** URL pública do logo (Storage Supabase ou CDN) */
  logo: string | null;
  /** Cor principal da marca (hex ou CSS válido) — usada no tema do painel / vitrine */
  cor_tema: string;
}

export interface Prato {
  id: string;
  restaurante_id: string;
  nome: string;
  /** Valor monetário em reais (ajuste para centavos no DB se preferir integer) */
  preco: number;
  descricao: string | null;
  /** URL pública no Storage Supabase (`imagens-pratos`) ou CDN */
  imagem: string | null;
  status: PratoStatus;
  /** Seção na vitrine pública (ex.: Bebidas). Opcional no banco. */
  categoria?: string | null;
}

/** Item de carrinho simulado (WhatsApp / preview) */
export interface CarrinhoItem {
  prato: Prato;
  quantidade: number;
}
