/**
 * Tipagens centrais do domínio (Supabase / multitenant).
 * Mantenha alinhado com as tabelas `restaurantes` e `pratos`.
 */

import type { FuncionamentoSemana } from "@/lib/restaurante/funcionamento-semana";
import type { TaxaEntregaZona } from "@/lib/restaurante/taxas-entrega-zonas";

export type PratoStatus = "ativo" | "pausado";

export type EntregaModo = "fixa" | "zonas";

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
  /** Agenda semanal (substitui gradualmente o texto livre de horário). */
  funcionamento_semana?: FuncionamentoSemana | null;
  /** Taxas por região/bairro (substitui taxa única quando preenchido). */
  taxas_entrega_zonas?: TaxaEntregaZona[] | null;
  /** fixa = uma taxa (`taxa_entrega`); zonas = várias taxas em `taxas_entrega_zonas`. */
  entrega_modo?: EntregaModo;
  /** Cliente pode escolher retirada no balcão (sem taxa de entrega). */
  retirada_balcao?: boolean;
  /** Ordem das seções do cardápio público (nomes de categoria). */
  cardapio_categorias?: string[] | null;
  /** Frase curta na vitrine pública abaixo do status (opcional). */
  mensagem_boas_vindas?: string | null;
  /** Linha ao lado de “Aberto” quando aceita pedidos (opcional). */
  texto_vitrine_aberto?: string | null;
  /** Linha ao lado de “Fechado” quando pedidos indisponíveis (opcional). */
  texto_vitrine_fechado?: string | null;
  /** Aviso quando fora do horário (pedidos bloqueados por agenda, não pausa manual). */
  mensagem_fora_horario?: string | null;
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
  /** Observações por linha (ex.: ponto da carne, sem cebola). */
  observacoes?: string | null;
}
