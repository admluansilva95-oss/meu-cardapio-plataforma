/** Texto WhatsApp ao mover pedido de entrega para a coluna "Pronto". */
export function mensagemWhatsappPedidoProntoEntrega(
  cliente: string,
  motoboy: string | null | undefined,
): string {
  const nomeMotoboy = motoboy?.trim();
  const complemento = nomeMotoboy
    ? `com o motoboy ${nomeMotoboy}`
    : "com a nossa equipe de entrega";
  return `Olá ${cliente}, seu pedido está pronto e já saiu para entrega ${complemento}. Obrigado pela preferência!`;
}
