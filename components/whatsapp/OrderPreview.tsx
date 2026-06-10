"use client";

import { useMemo } from "react";
import type { CarrinhoItem, Restaurante } from "../../types";
import {
  buildPedidoTextoWhatsApp,
  taxaEntregaParaPedido,
  type TipoEntregaPedido,
} from "@/lib/restaurante/pedido-texto-whatsapp";
import { expandLatin1UserText } from "@/lib/restaurante/json-latin1-wire";

export interface OrderPreviewProps {
  restaurante: Restaurante;
  itens: CarrinhoItem[];
  onAlterarQuantidade?: (pratoId: string, quantidade: number) => void;
  /** Simula retirada no balcão (taxa zero) quando o restaurante oferece essa opção. */
  tipoEntrega?: TipoEntregaPedido;
}

function onlyDigits(whatsapp: string) {
  return whatsapp.replace(/\D/g, "");
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function OrderPreview({
  restaurante,
  itens,
  onAlterarQuantidade,
  tipoEntrega = "entrega",
}: OrderPreviewProps) {
  const waNumber = useMemo(() => onlyDigits(restaurante.whatsapp), [restaurante.whatsapp]);

  const zonaUnica =
    restaurante.taxas_entrega_zonas?.length === 1 ? restaurante.taxas_entrega_zonas[0].id : null;

  const textoPedido = useMemo(
    () => buildPedidoTextoWhatsApp(restaurante, itens, zonaUnica, { tipoEntrega }),
    [restaurante, itens, zonaUnica, tipoEntrega],
  );

  const href = useMemo(() => {
    if (!waNumber) return null;
    const text = encodeURIComponent(expandLatin1UserText(textoPedido));
    return `https://wa.me/${waNumber}?text=${text}`;
  }, [waNumber, textoPedido]);

  const subtotal = itens.reduce((acc, { prato, quantidade }) => acc + prato.preco * quantidade, 0);
  const { valor: taxaBase } = taxaEntregaParaPedido(restaurante, zonaUnica, { tipo: tipoEntrega });
  const taxaExibir = itens.length > 0 ? taxaBase : 0;
  const total = subtotal + taxaExibir;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/80 shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="text-sm font-semibold text-slate-900">Prévia do pedido (WhatsApp)</h3>
        <p className="mt-1 text-xs text-slate-500">
          Simula o carrinho do cliente e monta o link{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">wa.me</code> com o texto
          pré-preenchido.
        </p>
      </div>

      <div className="space-y-4 px-5 py-4">
        {itens.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            Carrinho vazio. Adicione pratos na aba Cardápio para simular o fluxo.
          </p>
        ) : (
          <ul className="space-y-3">
            {itens.map(({ prato, quantidade }) => (
              <li
                key={prato.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3 py-3 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{prato.nome}</p>
                  <p className="text-xs text-slate-500">
                    {formatBRL(prato.preco)} · subtotal{" "}
                    {formatBRL(prato.preco * quantidade)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                    onClick={() =>
                      onAlterarQuantidade?.(prato.id, Math.max(1, quantidade - 1))
                    }
                    aria-label="Diminuir quantidade"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm font-semibold text-slate-800">
                    {quantidade}
                  </span>
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                    onClick={() => onAlterarQuantidade?.(prato.id, quantidade + 1)}
                    aria-label="Aumentar quantidade"
                  >
                    +
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {itens.length > 0 && taxaExibir > 0 ? (
          <div className="space-y-1 rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-600">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatBRL(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Taxa de entrega</span>
              <span className="tabular-nums">{formatBRL(taxaExibir)}</span>
            </div>
          </div>
        ) : itens.length > 0 && tipoEntrega === "retirada" ? (
          <div className="space-y-1 rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-600">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatBRL(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Entrega</span>
              <span className="text-right text-slate-800">Retirada no balcão</span>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
          <span className="text-sm font-medium">{taxaExibir > 0 ? "Total" : "Total estimado"}</span>
          <span className="text-base font-semibold tabular-nums">{formatBRL(total)}</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-900/[0.02] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Mensagem gerada
          </p>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-xs text-slate-700 ring-1 ring-slate-100">
            {textoPedido}
          </pre>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-900/20 transition hover:bg-emerald-500"
            >
              Abrir WhatsApp
            </a>
          ) : (
            <span className="inline-flex flex-1 items-center justify-center rounded-xl bg-slate-200 px-4 py-2.5 text-sm font-medium text-slate-500">
              Cadastre um WhatsApp válido no restaurante
            </span>
          )}
          {href ? (
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(href);
                } catch {
                  /* noop */
                }
              }}
            >
              Copiar link
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
