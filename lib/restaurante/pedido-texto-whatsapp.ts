import type { CarrinhoItem, Restaurante } from "@/types";
import { expandLatin1UserText } from "@/lib/restaurante/json-latin1-wire";

export type TipoEntregaPedido = "entrega" | "retirada";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function taxaEntregaParaPedido(
  restaurante: Restaurante,
  zonaId: string | null,
  opts?: { tipo?: TipoEntregaPedido },
): { valor: number; linhaExtra: string | null } {
  if (opts?.tipo === "retirada") {
    return { valor: 0, linhaExtra: null };
  }
  const zonas = restaurante.taxas_entrega_zonas;
  if (zonas && zonas.length > 0) {
    const z = zonaId ? zonas.find((x) => x.id === zonaId) : zonas.length === 1 ? zonas[0] : null;
    if (!z) return { valor: 0, linhaExtra: null };
    return {
      valor: z.valor,
      linhaExtra: zonas.length > 1 ? `*Região:* ${z.nome}` : null,
    };
  }
  const t = restaurante.taxa_entrega;
  if (t != null && t > 0) return { valor: t, linhaExtra: null };
  return { valor: 0, linhaExtra: null };
}

export function buildPedidoTextoWhatsApp(
  restaurante: Restaurante,
  itens: CarrinhoItem[],
  zonaEntregaId: string | null,
  opts?: { tipoEntrega?: TipoEntregaPedido },
): string {
  const tipoEntrega = opts?.tipoEntrega ?? "entrega";
  const linhasItens = itens.map(({ prato, quantidade }) => {
    const sub = prato.preco * quantidade;
    return `- ${quantidade}x ${prato.nome} - ${formatBRL(sub)}`;
  });
  const subtotal = itens.reduce((acc, { prato, quantidade }) => acc + prato.preco * quantidade, 0);
  const { valor: taxa, linhaExtra } = taxaEntregaParaPedido(restaurante, zonaEntregaId, {
    tipo: tipoEntrega,
  });
  const taxaAplicada = itens.length > 0 ? taxa : 0;
  const total = subtotal + taxaAplicada;

  const blocos: string[] = [
    `Olá! Gostaria de fazer um pedido no *${restaurante.nome}*.`,
    "",
    "*Itens do pedido*",
    ...linhasItens,
    "",
  ];
  if (tipoEntrega === "retirada" && restaurante.retirada_balcao) {
    blocos.push("*Retirada no balcão*", "");
    const end = restaurante.retirada_endereco_balcao?.trim();
    if (end) {
      blocos.push("*Endereço para retirada:*", end, "");
    }
    const prep = restaurante.retirada_preparo_estimado?.trim();
    if (prep) {
      blocos.push(`*Preparo estimado:* ${prep}`, "");
    }
  } else if (tipoEntrega === "entrega") {
    blocos.push("*Entrega no endereço informado no chat*", "");
  }
  if (linhaExtra) blocos.push(linhaExtra, "");
  if (taxaAplicada > 0) {
    blocos.push(`*Subtotal:* ${formatBRL(subtotal)}`);
    blocos.push(`*Taxa de entrega:* ${formatBRL(taxaAplicada)}`);
    blocos.push("");
  }
  blocos.push(`*Total do pedido:* ${formatBRL(total)}`);
  return expandLatin1UserText(blocos.join("\n"));
}
