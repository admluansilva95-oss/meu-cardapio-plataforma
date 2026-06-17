import type { CarrinhoItem } from "@/types";
import type { TipoEntregaPedido } from "@/lib/restaurante/pedido-texto-whatsapp";
import { expandLatin1UserText } from "@/lib/restaurante/json-latin1-wire";
import { categoriaOcultaObservacoesCliente } from "@/lib/restaurante/cardapio-categorias";

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
      return "Cartão de débito";
    case "cartao_credito":
      return "Cartão de crédito";
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
  /** Opcional — enriquece a mensagem de retirada enviada ao restaurante. */
  restauranteNome?: string;
  retiradaEndereco?: string | null;
  retiradaPreparoEstimado?: string | null;
}

function linhasItens(itens: CarrinhoItem[], obsEmItalico: boolean): string[] {
  const prefix = "- ";
  const linhas: string[] = [];
  for (const { prato, quantidade, observacoes } of itens) {
    const unit = formatBRL(prato.preco);
    linhas.push(`${prefix}${quantidade}x ${prato.nome} (${unit} cada)`);
    const obs = observacoes?.trim();
    if (obs && !categoriaOcultaObservacoesCliente(prato.categoria)) {
      linhas.push(obsEmItalico ? `  _Obs.: ${obs}_` : `  Obs.: ${obs}`);
    }
  }
  return linhas;
}

function blocoValoresCliente(p: PedidoWhatsAppFormatadoInput): string[] {
  if (p.tipoEntrega === "retirada") {
    return [`- *Total do pedido: ${formatBRL(p.totalGeral)}*`];
  }
  const linhas = [`- Subtotal dos itens: ${formatBRL(p.subtotalItens)}`];
  if (p.taxaEntrega > 0) {
    linhas.push(`- Taxa de entrega: ${formatBRL(p.taxaEntrega)}`);
  }
  linhas.push(`- *Total do pedido: ${formatBRL(p.totalGeral)}*`);
  return linhas;
}

/**
 * Resumo do pedido para **persistência / API / painel admin** (não vai ao WhatsApp do cliente).
 * O prefixo interno de retirada é acrescentado em `app/api/pedidos/vitrine/route.ts`.
 */
export function montarTextoPedidoResumoParaApi(p: PedidoWhatsAppFormatadoInput): string {
  const tipoLabel =
    p.tipoEntrega === "retirada" ? "Retirada no balcão" : "Entrega";

  const partes: string[] = [
    "NOVO PEDIDO",
    "--------------------------------",
    "CLIENTE",
    `- Nome: ${p.nomeCliente.trim()}`,
    `- Telefone: ${p.telefoneCliente.trim()}`,
    "",
    "ENTREGA / RETIRADA",
    `- Tipo: ${tipoLabel}`,
    `- Endereço: ${p.enderecoLinha}`,
    `- Bairro: ${p.bairroLinha}`,
    `- Referência / complemento: ${p.refCompLinha}`,
    "",
    "ITENS",
    ...linhasItens(p.itens, false),
    "",
    "PAGAMENTO",
    `- Forma: ${labelFormaPagamento(p.formaPagamento)}`,
    `- Troco para: ${p.trocoParaTexto}`,
    `- Valor do troco: ${formatBRL(Math.max(0, p.valorTrocoReais))}`,
    "",
    "--------------------------------",
    "VALORES",
    `- Subtotal dos itens: ${formatBRL(p.subtotalItens)}`,
    `- Taxa de entrega: ${formatBRL(Math.max(0, p.taxaEntrega))}`,
    `- TOTAL GERAL: ${formatBRL(p.totalGeral)}`,
    "--------------------------------",
  ];

  return expandLatin1UserText(partes.join("\n"));
}

/**
 * Mensagem que o **cliente** envia ao restaurante pelo WhatsApp.
 * Linguagem em primeira pessoa, sem instruções internas do painel/esteira.
 */
export function montarTextoPedidoWhatsAppFormatado(p: PedidoWhatsAppFormatadoInput): string {
  const nomeRest = p.restauranteNome?.trim();
  const saudacao = nomeRest
    ? `Olá! Gostaria de fazer um pedido no *${nomeRest}*.`
    : "Olá! Gostaria de fazer um pedido.";

  if (p.tipoEntrega === "retirada") {
    const endRetirada = p.retiradaEndereco?.trim();
    const prepRetirada = p.retiradaPreparoEstimado?.trim();

    const partes: string[] = [
      saudacao,
      "",
      "Modalidade: *retirada no balcão* (vou buscar no estabelecimento).",
      "",
      "*Meus dados*",
      `- Nome: ${p.nomeCliente.trim()}`,
      `- Telefone: ${p.telefoneCliente.trim()}`,
      "",
      "*Itens do pedido*",
      ...linhasItens(p.itens, true),
      "",
      "*Pagamento*",
      `- Forma: ${labelFormaPagamento(p.formaPagamento)}`,
      `- Troco para: ${p.trocoParaTexto}`,
      p.formaPagamento === "dinheiro" && p.valorTrocoReais > 0
        ? `- Troco necessário: ${formatBRL(p.valorTrocoReais)}`
        : "",
      "",
      "*Valores*",
      ...blocoValoresCliente(p),
      "",
      "*Retirada no balcão*",
      endRetirada
        ? `- Endereço para retirada: ${endRetirada}`
        : "- Endereço para retirada: confirmo o local por este chat.",
      prepRetirada ? `- Preparo estimado (informado pelo restaurante): ${prepRetirada}` : "",
      "",
      "Aguardo a confirmação do pedido e o horário em que ficará pronto para eu retirar. Obrigado!",
    ].filter((linha) => linha !== "");

    return expandLatin1UserText(partes.join("\n"));
  }

  const partes: string[] = [
    saudacao,
    "",
    "Modalidade: *entrega* no endereço abaixo.",
    "",
    "*Meus dados*",
    `- Nome: ${p.nomeCliente.trim()}`,
    `- Telefone: ${p.telefoneCliente.trim()}`,
    "",
    "*Endereço de entrega*",
    `- Endereço: ${p.enderecoLinha}`,
    `- Bairro: ${p.bairroLinha}`,
    `- Referência / complemento: ${p.refCompLinha}`,
    "",
    "*Itens do pedido*",
    ...linhasItens(p.itens, true),
    "",
    "*Pagamento*",
    `- Forma: ${labelFormaPagamento(p.formaPagamento)}`,
    `- Troco para: ${p.trocoParaTexto}`,
    p.formaPagamento === "dinheiro" && p.valorTrocoReais > 0
      ? `- Troco necessário: ${formatBRL(p.valorTrocoReais)}`
      : "",
    "",
    "*Valores*",
    ...blocoValoresCliente(p),
    "",
    "Aguardo a confirmação do pedido. Obrigado!",
  ].filter((linha) => linha !== "");

  return expandLatin1UserText(partes.join("\n"));
}
