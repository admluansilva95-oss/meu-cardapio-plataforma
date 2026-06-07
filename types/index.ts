/**
 * Tipagens centrais do domínio (Supabase / multitenant).
 * Mantenha alinhado com as tabelas `restaurantes` e `pratos`.
 */

export type PratoStatus = "ativo" | "pausado";

export interface Restaurante {
  id: string;
  /** Valor salvo em `restaurantes.nome` (pode estar vazio; a UI usa fallback a partir do slug). */
  rawNome: string;
  /** Nome exibido no painel e na vitrine. */
  nome: string;
  slug: string;
  /** Número no formato que o time usar no cadastro (ex.: +55 11 91234-5678) */
  whatsapp: string;
  /** URL pública do logo (Storage Supabase ou CDN) */
  logo: string | null;
  /** Cor principal da marca (hex ou CSS válido) — usada no tema do painel / vitrine */
  cor_tema: string;
  /** Horários exibidos na vitrine (texto livre). */
  horario_funcionamento?: string | null;
  /** Taxa fixa de entrega (R$), opcional. */
  taxa_entrega?: number | null;
  /** Se true, a vitrine pública mostra aviso de fechado e não aceita novos itens no carrinho. */
  vitrine_fechada?: boolean;
  /** Texto opcional no aviso de fechado; se vazio, a vitrine usa mensagem padrão. */
  mensagem_fechado?: string | null;
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
