"use client";

import { useEffect, useState } from "react";
import type { CarrinhoItem, Restaurante } from "@/types";
import type { TipoEntregaPedido } from "@/lib/restaurante/pedido-texto-whatsapp";
import type { FormaPagamentoPedidoCliente } from "@/lib/restaurante/pedido-whatsapp-formatado";
import { formatBRL } from "@/lib/restaurante/format-brl";
import { formatarTelefoneWhatsappBR } from "@/lib/restaurante/br-telefone-mascara";
import { categoriaOcultaObservacoesCliente } from "@/lib/restaurante/cardapio-categorias";
import type { TaxaEntregaZona } from "@/lib/restaurante/taxas-entrega-zonas";

export type CartDrawerProps = {
  open: boolean;
  onClose: () => void;
  restaurante: Restaurante;
  cart: CarrinhoItem[];
  pedidosBloqueados: boolean;
  tipoEntrega: TipoEntregaPedido;
  onTipoEntregaChange: (v: TipoEntregaPedido) => void;
  zonaEntregaId: string | null;
  onZonaEntregaIdChange: (id: string) => void;
  zonasEntrega: TaxaEntregaZona[];
  zonasFiltradasPorBusca: TaxaEntregaZona[];
  entregaBairroModo: "digitar" | "lista";
  onEntregaBairroModoChange: (v: "digitar" | "lista") => void;
  bairroBuscaTexto: string;
  onBairroBuscaTextoChange: (v: string) => void;
  bairroLivreTexto: string;
  onBairroLivreTextoChange: (v: string) => void;
  clienteNome: string;
  onClienteNomeChange: (v: string) => void;
  clienteTelefoneDisplay: string;
  onClienteTelefoneDisplayChange: (v: string) => void;
  checkoutRua: string;
  onCheckoutRuaChange: (v: string) => void;
  checkoutNumero: string;
  onCheckoutNumeroChange: (v: string) => void;
  checkoutComplemento: string;
  onCheckoutComplementoChange: (v: string) => void;
  formaPagamento: FormaPagamentoPedidoCliente;
  onFormaPagamentoChange: (v: FormaPagamentoPedidoCliente) => void;
  trocoParaInput: string;
  onTrocoParaInputChange: (v: string) => void;
  trocoParaValor: number | null;
  subtotalCarrinho: number;
  taxaCarrinho: number;
  total: number;
  checkoutErro: string | null;
  checkoutSubmitting: boolean;
  onEnviarPedido: () => void | Promise<void>;
  onSetQty: (pratoId: string, quantidade: number) => void;
  onSetItemObservacoes: (pratoId: string, texto: string) => void;
};

export default function CartDrawer(props: CartDrawerProps) {
  const {
    open,
    onClose,
    restaurante,
    cart,
    pedidosBloqueados,
    tipoEntrega,
    onTipoEntregaChange,
    zonaEntregaId,
    onZonaEntregaIdChange,
    zonasEntrega,
    zonasFiltradasPorBusca,
    entregaBairroModo,
    onEntregaBairroModoChange,
    bairroBuscaTexto,
    onBairroBuscaTextoChange,
    bairroLivreTexto,
    onBairroLivreTextoChange,
    clienteNome,
    onClienteNomeChange,
    clienteTelefoneDisplay,
    onClienteTelefoneDisplayChange,
    checkoutRua,
    onCheckoutRuaChange,
    checkoutNumero,
    onCheckoutNumeroChange,
    checkoutComplemento,
    onCheckoutComplementoChange,
    formaPagamento,
    onFormaPagamentoChange,
    trocoParaInput,
    onTrocoParaInputChange,
    trocoParaValor,
    subtotalCarrinho,
    taxaCarrinho,
    total,
    checkoutErro,
    checkoutSubmitting,
    onEnviarPedido,
    onSetQty,
    onSetItemObservacoes,
  } = props;

  const [zonasListaExpandida, setZonasListaExpandida] = useState(true);

  useEffect(() => {
    if (!open) return;
    setZonasListaExpandida(zonaEntregaId == null);
  }, [open, zonaEntregaId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/30 backdrop-blur-md"
        aria-label="Fechar carrinho"
        onClick={onClose}
      />
      <aside
        className="relative flex h-[100dvh] w-full max-w-lg flex-col overflow-hidden rounded-l-[1.25rem] border-l border-zinc-200/80 bg-white/95 shadow-[0_0_0_1px_rgba(0,0,0,0.03)] shadow-2xl ring-1 ring-black/[0.04] backdrop-blur-xl sm:max-w-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-100/90 px-5 py-4 sm:px-6 sm:py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Checkout</p>
            <h2 id="cart-title" className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
              Seu pedido
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
            aria-label="Fechar"
          >
            <span className="text-lg leading-none">×</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:py-5">
          {cart.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-14 text-center text-sm leading-relaxed text-zinc-500">
              Carrinho vazio. Toque em &quot;+&quot; nos pratos que desejar.
            </p>
          ) : (
            <div className="space-y-8">
              <section aria-labelledby="cart-itens">
                <h3 id="cart-itens" className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Itens
                </h3>
                <ul className="mt-3 space-y-3">
                  {cart.map(({ prato, quantidade, observacoes }) => (
                    <li key={prato.id} className="rounded-2xl border border-zinc-100 bg-zinc-50/50 p-4 shadow-sm">
                      <div className="flex gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold tracking-tight text-zinc-900">{prato.nome}</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {formatBRL(prato.preco)} cada ·{" "}
                            <span className="font-medium text-zinc-800">
                              {formatBRL(prato.preco * quantidade)}
                            </span>
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-800 transition hover:bg-zinc-50 active:scale-95"
                            onClick={() => onSetQty(prato.id, quantidade - 1)}
                            aria-label="Diminuir"
                          >
                            −
                          </button>
                          <span className="w-8 text-center text-sm font-semibold tabular-nums">{quantidade}</span>
                          <button
                            type="button"
                            className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-800 transition hover:bg-zinc-50 active:scale-95"
                            onClick={() => onSetQty(prato.id, quantidade + 1)}
                            aria-label="Aumentar"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      {categoriaOcultaObservacoesCliente(prato.categoria) ? null : (
                        <>
                          <label className="mt-3 block text-[11px] font-medium text-zinc-500" htmlFor={`obs-${prato.id}`}>
                            Observações (opcional)
                          </label>
                          <textarea
                            id={`obs-${prato.id}`}
                            rows={2}
                            value={observacoes ?? ""}
                            onChange={(e) => onSetItemObservacoes(prato.id, e.target.value)}
                            placeholder="Ex.: sem cebola, ponto da carne…"
                            className="mt-1 w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-xs text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-950"
                          />
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="space-y-3" aria-labelledby="cart-cliente">
                <h3 id="cart-cliente" className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Seus dados
                </h3>
                <div className="space-y-2.5">
                  <input
                    type="text"
                    autoComplete="name"
                    value={clienteNome}
                    onChange={(e) => onClienteNomeChange(e.target.value.slice(0, 120))}
                    placeholder="Nome completo"
                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-950"
                  />
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    value={clienteTelefoneDisplay}
                    onChange={(e) => onClienteTelefoneDisplayChange(formatarTelefoneWhatsappBR(e.target.value))}
                    placeholder="(00) 00000-0000"
                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-950"
                  />
                </div>
              </section>

              {cart.length > 0 ? (
                <section className="space-y-3" aria-labelledby="cart-entrega">
                  <h3 id="cart-entrega" className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Entrega ou retirada
                  </h3>
                  {restaurante.retirada_balcao ? (
                    <div className="flex rounded-2xl border border-zinc-200 bg-zinc-100/80 p-1">
                      <button
                        type="button"
                        onClick={() => onTipoEntregaChange("entrega")}
                        className={[
                          "flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all",
                          tipoEntrega === "entrega"
                            ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/80"
                            : "text-zinc-500 hover:text-zinc-800",
                        ].join(" ")}
                      >
                        Entrega
                      </button>
                      <button
                        type="button"
                        onClick={() => onTipoEntregaChange("retirada")}
                        className={[
                          "flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all",
                          tipoEntrega === "retirada"
                            ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/80"
                            : "text-zinc-500 hover:text-zinc-800",
                        ].join(" ")}
                      >
                        Retirada
                      </button>
                    </div>
                  ) : (
                    <p className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2 text-xs text-zinc-600">
                      Entrega no endereço informado abaixo.
                    </p>
                  )}

                  {tipoEntrega === "entrega" ? (
                    <div className="space-y-3 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <label className="text-[11px] font-medium text-zinc-500" htmlFor="checkout-rua">
                            Rua
                          </label>
                          <input
                            id="checkout-rua"
                            type="text"
                            value={checkoutRua}
                            onChange={(e) => onCheckoutRuaChange(e.target.value.slice(0, 120))}
                            className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:ring-2 focus:ring-zinc-950"
                          />
                        </div>
                        <div className={zonasEntrega.length === 1 ? "" : "sm:col-span-2"}>
                          <label className="text-[11px] font-medium text-zinc-500" htmlFor="checkout-numero">
                            Número
                          </label>
                          <input
                            id="checkout-numero"
                            type="text"
                            inputMode="numeric"
                            value={checkoutNumero}
                            onChange={(e) => onCheckoutNumeroChange(e.target.value.slice(0, 12))}
                            className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:ring-2 focus:ring-zinc-950"
                          />
                        </div>
                        {zonasEntrega.length === 1 ? (
                          <div>
                            <span className="text-[11px] font-medium text-zinc-500">Bairro (taxa)</span>
                            <div className="mt-1 rounded-xl border border-zinc-100 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-800">
                              {zonasEntrega[0].nome} — {formatBRL(zonasEntrega[0].valor)}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {zonasEntrega.length > 1 ? (
                        <div className="min-h-0 space-y-2">
                          {!zonasListaExpandida && zonaEntregaId ? (
                            <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-3">
                              <div className="min-w-0 flex-1 text-left">
                                <p className="text-[11px] font-medium text-zinc-500">Bairro / região</p>
                                <p className="mt-0.5 truncate text-sm font-semibold text-zinc-900">
                                  {zonasEntrega.find((z) => z.id === zonaEntregaId)?.nome ?? "—"}
                                  <span className="ml-2 font-normal tabular-nums text-zinc-600">
                                    — {formatBRL(zonasEntrega.find((z) => z.id === zonaEntregaId)?.valor ?? 0)}
                                  </span>
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setZonasListaExpandida(true)}
                                className="shrink-0 rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 active:scale-[0.98]"
                              >
                                Alterar
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex rounded-2xl border border-zinc-200 bg-zinc-100/80 p-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onEntregaBairroModoChange("digitar");
                                    setZonasListaExpandida(true);
                                  }}
                                  className={[
                                    "flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all",
                                    entregaBairroModo === "digitar"
                                      ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/80"
                                      : "text-zinc-500 hover:text-zinc-800",
                                  ].join(" ")}
                                >
                                  Digitar bairro
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onEntregaBairroModoChange("lista");
                                    setZonasListaExpandida(true);
                                  }}
                                  className={[
                                    "flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all",
                                    entregaBairroModo === "lista"
                                      ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/80"
                                      : "text-zinc-500 hover:text-zinc-800",
                                  ].join(" ")}
                                >
                                  Ver lista
                                </button>
                              </div>

                              {entregaBairroModo === "digitar" ? (
                                <div className="min-h-0 space-y-2">
                                  <label className="text-[11px] font-medium text-zinc-500" htmlFor="checkout-bairro-busca">
                                    Buscar nas regiões do restaurante
                                  </label>
                                  <input
                                    id="checkout-bairro-busca"
                                    type="text"
                                    value={bairroBuscaTexto}
                                    onChange={(e) => onBairroBuscaTextoChange(e.target.value.slice(0, 80))}
                                    placeholder="Ex.: Centro, Jardim…"
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:ring-2 focus:ring-zinc-950"
                                  />
                                  <div className="min-h-0 overflow-hidden rounded-xl border border-zinc-100 bg-zinc-50/50">
                                    <div
                                      className="max-h-44 space-y-1 overflow-y-auto overflow-x-hidden overscroll-y-contain scroll-smooth p-1 [-webkit-overflow-scrolling:touch] sm:max-h-52"
                                      role="listbox"
                                      aria-label="Resultados da busca por bairro"
                                    >
                                      {zonasFiltradasPorBusca.length === 0 ? (
                                        <p className="px-3 py-2 text-xs leading-relaxed text-zinc-500">
                                          Nenhuma região encontrada com esse texto. Ajuste a busca ou use a aba
                                          &quot;Ver lista&quot;.
                                        </p>
                                      ) : (
                                        zonasFiltradasPorBusca.map((z) => (
                                          <button
                                            key={z.id}
                                            type="button"
                                            role="option"
                                            aria-selected={zonaEntregaId === z.id}
                                            onClick={() => onZonaEntregaIdChange(z.id)}
                                            className={[
                                              "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium transition",
                                              zonaEntregaId === z.id
                                                ? "bg-zinc-900 text-white"
                                                : "text-zinc-800 hover:bg-white",
                                            ].join(" ")}
                                          >
                                            <span className="min-w-0 pr-2">{z.nome}</span>
                                            <span className="shrink-0 tabular-nums text-xs opacity-90">
                                              {formatBRL(z.valor)}
                                            </span>
                                          </button>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                  {zonaEntregaId ? (
                                    <p className="text-[11px] text-zinc-500">
                                      Selecionado:{" "}
                                      <span className="font-semibold text-zinc-800">
                                        {zonasEntrega.find((z) => z.id === zonaEntregaId)?.nome}
                                      </span>
                                    </p>
                                  ) : (
                                    <p className="text-[11px] text-zinc-500">Toque em uma região para definir a taxa.</p>
                                  )}
                                </div>
                              ) : (
                                <div className="min-h-0 space-y-2">
                                  <p className="text-[11px] font-medium text-zinc-500">Bairro / região</p>
                                  <div className="min-h-0 overflow-hidden rounded-xl border border-zinc-100 bg-zinc-50/50">
                                    <div
                                      className="max-h-44 space-y-1 overflow-y-auto overflow-x-hidden overscroll-y-contain scroll-smooth p-1 [-webkit-overflow-scrolling:touch] sm:max-h-52"
                                      role="listbox"
                                      aria-label="Lista de bairros e taxas"
                                    >
                                      {zonasEntrega.map((z) => (
                                        <button
                                          key={z.id}
                                          type="button"
                                          role="option"
                                          aria-selected={zonaEntregaId === z.id}
                                          onClick={() => onZonaEntregaIdChange(z.id)}
                                          className={[
                                            "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium transition",
                                            zonaEntregaId === z.id
                                              ? "bg-zinc-900 text-white"
                                              : "text-zinc-800 hover:bg-white",
                                          ].join(" ")}
                                        >
                                          <span className="min-w-0 pr-2">{z.nome}</span>
                                          <span className="shrink-0 tabular-nums text-xs opacity-90">
                                            {formatBRL(z.valor)}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  {!zonaEntregaId ? (
                                    <p className="text-[11px] text-zinc-500">Toque em uma região para definir a taxa.</p>
                                  ) : null}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      ) : null}

                      {zonasEntrega.length === 0 ? (
                        <div>
                          <label className="text-[11px] font-medium text-zinc-500" htmlFor="checkout-bairro-livre">
                            Bairro ou região
                          </label>
                          <input
                            id="checkout-bairro-livre"
                            type="text"
                            value={bairroLivreTexto}
                            onChange={(e) => onBairroLivreTextoChange(e.target.value.slice(0, 80))}
                            placeholder="Informe o bairro da entrega"
                            className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-950"
                          />
                          <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                            Taxa de entrega conforme cadastro do restaurante (sem regiões listadas).
                          </p>
                        </div>
                      ) : null}

                      <div>
                        <label className="text-[11px] font-medium text-zinc-500" htmlFor="checkout-comp">
                          Complemento / referência
                        </label>
                        <input
                          id="checkout-comp"
                          type="text"
                          value={checkoutComplemento}
                          onChange={(e) => onCheckoutComplementoChange(e.target.value.slice(0, 160))}
                          placeholder="Apto, bloco, ponto de referência…"
                          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-950"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-sm leading-relaxed text-emerald-900">
                      <p>
                        <span className="font-semibold">Retirada no balcão</span> — sem taxa de entrega. O pedido entra
                        no painel do restaurante (esteira em &quot;Pendente&quot;) para preparo e acompanhamento. O
                        WhatsApp abre em seguida para você combinar detalhes com o local, se precisar.
                      </p>
                      {restaurante.retirada_endereco_balcao?.trim() ? (
                        <div className="rounded-xl border border-emerald-200/80 bg-white/90 px-3 py-2.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/90">
                            Endereço para retirada
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-emerald-950">
                            {restaurante.retirada_endereco_balcao.trim()}
                          </p>
                        </div>
                      ) : (
                        <p className="text-[13px] text-emerald-900/90">
                          Quando estiver pronto, retire no balcão. Se o endereço não aparecer aqui, o restaurante pode
                          enviar pelo WhatsApp.
                        </p>
                      )}
                      {restaurante.retirada_preparo_estimado?.trim() ? (
                        <p className="text-[13px] text-emerald-900/90">
                          <span className="font-semibold">Tempo estimado de preparo:</span>{" "}
                          {restaurante.retirada_preparo_estimado.trim()}
                        </p>
                      ) : null}
                    </div>
                  )}
                </section>
              ) : null}

              <section className="space-y-3" aria-labelledby="cart-pagamento">
                <h3 id="cart-pagamento" className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Pagamento
                </h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(
                    [
                      ["dinheiro", "Dinheiro"],
                      ["cartao_debito", "Cartão de Débito"],
                      ["cartao_credito", "Cartão de Crédito"],
                      ["pix", "Pix"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onFormaPagamentoChange(id)}
                      aria-label={label}
                      className={[
                        "min-h-[2.75rem] rounded-xl border px-1.5 py-2 text-center text-[11px] font-semibold leading-tight transition active:scale-[0.98] sm:min-h-0 sm:px-2 sm:text-xs",
                        formaPagamento === id
                          ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
                          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300",
                      ].join(" ")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {formaPagamento === "dinheiro" ? (
                  <div className="rounded-2xl border border-zinc-100 bg-zinc-50/60 p-4">
                    <label className="text-[11px] font-medium text-zinc-500" htmlFor="troco-para">
                      Precisa de troco para quanto?
                    </label>
                    <input
                      id="troco-para"
                      type="text"
                      inputMode="decimal"
                      value={trocoParaInput}
                      onChange={(e) => onTrocoParaInputChange(e.target.value.slice(0, 14))}
                      placeholder="Ex.: 100,00"
                      className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:ring-2 focus:ring-zinc-950"
                    />
                    {trocoParaValor != null && trocoParaValor >= total ? (
                      <p className="mt-2 text-xs text-zinc-600">
                        Total {formatBRL(total)} · troco para {formatBRL(trocoParaValor)} ·{" "}
                        <span className="font-semibold text-zinc-900">
                          seu troco: {formatBRL(trocoParaValor - total)}
                        </span>
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </section>
            </div>
          )}
        </div>

        <div className="shrink-0 space-y-3 border-t border-zinc-100 bg-white/95 px-5 py-4 backdrop-blur-md sm:px-6 sm:py-5">
          {cart.length > 0 ? (
            <>
              <div className="space-y-1.5 text-sm text-zinc-500">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="tabular-nums text-zinc-800">{formatBRL(subtotalCarrinho)}</span>
                </div>
                {tipoEntrega === "retirada" ? (
                  <div className="flex justify-between">
                    <span>Taxa de entrega</span>
                    <span className="text-right text-xs font-medium text-zinc-700">Retirada — sem taxa</span>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <span>Taxa de entrega</span>
                    <span className="tabular-nums text-zinc-800">{formatBRL(taxaCarrinho)}</span>
                  </div>
                )}
              </div>
              <div className="flex items-end justify-between border-t border-zinc-100 pt-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Total</span>
                <span className="text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">
                  {formatBRL(total)}
                </span>
              </div>
              {checkoutErro ? (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-center text-xs font-medium text-red-700 ring-1 ring-red-100">
                  {checkoutErro}
                </p>
              ) : null}
              {pedidosBloqueados ? (
                <p className="rounded-xl border border-amber-100/90 bg-amber-50/90 px-3 py-2.5 text-center text-[11.5px] font-medium leading-snug text-amber-950/90">
                  Monte seu pedido com calma — quando abrirmos, finalize aqui com um toque. Seu carrinho fica salvo neste
                  aparelho.
                </p>
              ) : null}
              <button
                type="button"
                disabled={checkoutSubmitting}
                onClick={() => void onEnviarPedido()}
                className="flex w-full items-center justify-center rounded-2xl bg-[#25D366] py-3.5 text-sm font-semibold text-white shadow-[0_12px_32px_-12px_rgba(37,211,102,0.55)] transition hover:bg-[#1ebe5a] enabled:active:scale-[0.99] disabled:cursor-wait disabled:opacity-80"
              >
                {checkoutSubmitting ? "Registrando pedido…" : "Enviar Pedido via WhatsApp"}
              </button>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
