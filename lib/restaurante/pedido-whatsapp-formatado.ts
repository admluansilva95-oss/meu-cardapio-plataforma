import type { CarrinhoItem } from "@/types";
import type { TipoEntregaPedido } from "@/lib/restaurante/pedido-texto-whatsapp";
import { latin1SafeString } from "@/lib/restaurante/json-latin1-wire";

export type FormaPagamentoPedidoCliente =
  | "dinheiro"
  | "pix"
  | "cartao_debito"
  | "cartao_credito";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function labelFormaPagamento(f: FormaPagamentoPedidoCliente): string {
  switch (f) {
    case "dinheiro":
      return "Dinheiro";
    case "pix":
      return "Pix";
    case "cartao_debito":
      return "Cartão de Débito";
    case "cartao_credito":
      return "Cartão de Crédito";
    default:
      return "Pix";
  }
}

export interface PedidoWhatsAppFormatadoInput {
  nomeCliente: string;
  telefoneCliente: string;
  tipoEntrega: TipoEntregaPedido;
  /** "Rua, Número" ou N/A */
  enderecoLinha: string;
  bairroLinha: string;
  refCompLinha: string;
  itens: CarrinhoItem[];
  formaPagamento: FormaPagamentoPedidoCliente;
  /** Texto exibido em “Troco para” */
  trocoParaTexto: string;
  valorTrocoReais: number;
  subtotalItens: number;
  taxaEntrega: number;
  totalGeral: number;
}

function linhasItensComMarcador(
  itens: CarrinhoItem[],
  marcador: "bullet" | "ascii",
): string[] {
  const prefix = marcador === "bullet" ? "• " : "- ";
  const linhas: string[] = [];
  for (const { prato, quantidade, observacoes } of itens) {
    const unit = formatBRL(prato.preco);
    linhas.push(`${prefix}${quantidade}x ${prato.nome} (${unit} cada)`);
    const obs = observacoes?.trim();
    if (obs) {
      linhas.push(marcador === "bullet" ? `  _Obs: ${obs}_` : `  Obs: ${obs}`);
    }
  }
  return linhas;
}

/**
 * Resumo do pedido para **persistência / fetch** (painel, API).
 * Sem `•` (U+2022), sem emojis: só Latin-1 seguro para corpo JSON e stacks ByteString.
 */
export function montarTextoPedidoResumoParaApi(p: PedidoWhatsAppFormatadoInput): string {
  const tipoLabel =
    p.tipoEntrega === "retirada" ? "Retirada no Balcão" : "Entrega";

  const partes: string[] = [
    "NOVO PEDIDO (resumo para o painel)",
    "--------------------------------",
    "CLIENTE:",
    `- Nome: ${p.nomeCliente.trim()}`,
    `- Telefone: ${p.telefoneCliente.trim()}`,
    "",
    "ENTREGA / RETIRADA:",
    `- Tipo: ${tipoLabel}`,
    `- Endereco: ${p.enderecoLinha}`,
    `- Bairro: ${p.bairroLinha}`,
    `- Ref/Comp: ${p.refCompLinha}`,
    "",
    "ITENS:",
    ...linhasItensComMarcador(p.itens, "ascii"),
    "",
    "PAGAMENTO:",
    `- Forma: ${labelFormaPagamento(p.formaPagamento)}`,
    `- Troco para: ${p.trocoParaTexto}`,
    `- Valor do Troco: ${formatBRL(Math.max(0, p.valorTrocoReais))}`,
    "",
    "--------------------------------",
    "VALORES:",
    `- Subtotal Itens: ${formatBRL(p.subtotalItens)}`,
    `- Taxa de Entrega: ${formatBRL(Math.max(0, p.taxaEntrega))}`,
    `- TOTAL GERAL: ${formatBRL(p.totalGeral)}`,
    "--------------------------------",
  ];

  return latin1SafeString(partes.join("\n"));
}

/**
 * Texto formatado para **abrir no WhatsApp** (`wa.me` / `window.open`) — pode usar `•` e emojis.
 * Não enviar este retorno no corpo de `fetch` para a API.
 */
export function montarTextoPedidoWhatsAppFormatado(p: PedidoWhatsAppFormatadoInput): string {
  const tipoLabel =
    p.tipoEntrega === "retirada" ? "Retirada no Balcão" : "Entrega";

  const partes: string[] = [
    "*🧾 NOVO PEDIDO RECEBIDO!*",
    "--------------------------------",
    "*👤 CLIENTE:*",
    `• Nome: ${p.nomeCliente.trim()}`,
    `• Telefone: ${p.telefoneCliente.trim()}`,
    "",
    "*📍 ENTREGA/RETIRADA:*",
    `• Tipo: ${tipoLabel}`,
    `• Endereço: ${p.enderecoLinha}`,
    `• Bairro: ${p.bairroLinha}`,
    `• Ref/Comp: ${p.refCompLinha}`,
    "",
    "*🍔 ITENS DO PEDIDO:*",
    ...linhasItensComMarcador(p.itens, "bullet"),
    "",
    "*💳 PAGAMENTO:*",
    `• Forma: ${labelFormaPagamento(p.formaPagamento)}`,
    `• Troco para: ${p.trocoParaTexto}`,
    `• Valor do Troco: ${formatBRL(Math.max(0, p.valorTrocoReais))}`,
    "",
    "--------------------------------",
    "*💰 VALORES:*",
    `• Subtotal Itens: ${formatBRL(p.subtotalItens)}`,
    `• Taxa de Entrega: ${formatBRL(Math.max(0, p.taxaEntrega))}`,
    `• *TOTAL GERAL: ${formatBRL(p.totalGeral)}*`,
    "--------------------------------",
  ];

  return partes.join("\n");
}
