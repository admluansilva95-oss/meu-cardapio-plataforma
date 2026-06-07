import type { CarrinhoItem } from "@/types";
import type { TipoEntregaPedido } from "@/lib/restaurante/pedido-texto-whatsapp";

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

/**
 * Texto único para o WhatsApp, com quebras de linha conforme especificação do produto.
 */
export function montarTextoPedidoWhatsAppFormatado(p: PedidoWhatsAppFormatadoInput): string {
  const tipoLabel =
    p.tipoEntrega === "retirada" ? "Retirada no Balcão" : "Entrega";

  const linhasItens: string[] = [];
  for (const { prato, quantidade, observacoes } of p.itens) {
    const unit = formatBRL(prato.preco);
    linhasItens.push(`• ${quantidade}x ${prato.nome} (${unit} cada)`);
    const obs = observacoes?.trim();
    if (obs) {
      linhasItens.push(`  _Obs: ${obs}_`);
    }
  }

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
    ...linhasItens,
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
