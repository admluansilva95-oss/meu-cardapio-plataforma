"use client";

import type { ComponentType } from "react";
import type { CarrinhoItem, Prato } from "@/types";
import { formatBRL } from "@/lib/restaurante/format-brl";
import { slugifySecaoCardapio } from "@/lib/restaurante/cardapio-categorias";

type PratoCoverImageProps = { src: string | null; nome: string };

export type CardapioListaProdutosProps = {
  categorias: readonly { titulo: string; lista: readonly Prato[] }[];
  cart: CarrinhoItem[];
  onSetQty: (pratoId: string, qty: number) => void;
  onAddToCart: (prato: Prato) => void;
  PratoCoverImage: ComponentType<PratoCoverImageProps>;
};

/**
 * Grid de seções e produtos da vitrine B2C — apenas apresentação; callbacks vêm do page container.
 */
export function CardapioListaProdutos({
  categorias,
  cart,
  onSetQty,
  onAddToCart,
  PratoCoverImage,
}: CardapioListaProdutosProps) {
  return (
    <div className="space-y-16 sm:space-y-20">
      {categorias.map(({ titulo, lista }) => {
        const secId = `sec-${slugifySecaoCardapio(titulo)}`;
        return (
          <section key={titulo} id={secId} aria-labelledby={`cat-${secId}`} className="scroll-mt-36 sm:scroll-mt-32">
            <div className="mb-6 flex items-baseline justify-between gap-4 border-b border-zinc-100/90 pb-3 sm:mb-8 sm:pb-4">
              <h2
                id={`cat-${secId}`}
                className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400"
              >
                {titulo}
              </h2>
              <span className="text-[11px] font-medium tabular-nums text-zinc-300">{lista.length}</span>
            </div>
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3 xl:gap-7">
              {lista.map((prato) => (
                <li key={prato.id}>
                  <article
                    data-reveal-scroll
                    className="reveal-scroll group flex h-full flex-col overflow-hidden rounded-3xl border border-zinc-200/60 bg-white shadow-[0_2px_24px_-12px_rgba(0,0,0,0.08)] transition duration-300 hover:border-zinc-200 hover:shadow-[0_12px_40px_-16px_rgba(0,0,0,0.12)]"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-50">
                      <PratoCoverImage src={prato.imagem} nome={prato.nome} />
                    </div>
                    <div className="flex flex-1 flex-col gap-2 p-5 sm:p-6">
                      <div className="flex flex-wrap items-start justify-between gap-3 gap-y-1">
                        <h3 className="min-w-0 flex-1 text-base font-semibold leading-snug tracking-tight text-zinc-900 sm:text-lg">
                          {prato.nome}
                        </h3>
                        <p className="shrink-0 text-base font-bold tabular-nums tracking-tight text-zinc-900">
                          {formatBRL(prato.preco)}
                        </p>
                      </div>
                      {prato.descricao ? (
                        <p className="line-clamp-3 text-sm leading-relaxed text-zinc-500">{prato.descricao}</p>
                      ) : null}
                      <div className="mt-auto flex items-center justify-end gap-1.5 pt-3">
                        {(() => {
                          const qty = cart.find((x) => x.prato.id === prato.id)?.quantidade ?? 0;
                          return (
                            <>
                              <button
                                type="button"
                                onClick={() => onSetQty(prato.id, qty - 1)}
                                disabled={qty < 1}
                                title={qty < 1 ? undefined : "Remover uma unidade"}
                                aria-label={
                                  qty < 1
                                    ? "Nenhuma unidade no carrinho"
                                    : `Remover uma unidade de ${prato.nome}`
                                }
                                className={[
                                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-lg font-light leading-none transition-transform duration-150 active:scale-95",
                                  qty < 1
                                    ? "cursor-not-allowed border-zinc-200/90 bg-zinc-50 text-zinc-300"
                                    : "border-zinc-200/90 bg-white text-zinc-800 shadow-sm hover:bg-zinc-50",
                                ].join(" ")}
                              >
                                <span aria-hidden>−</span>
                              </button>
                              {qty > 0 ? (
                                <span className="min-w-[2.25rem] select-none text-center text-sm font-semibold tabular-nums text-zinc-800">
                                  {qty}
                                </span>
                              ) : (
                                <span
                                  className="min-w-[2.25rem] select-none text-center text-sm tabular-nums text-transparent"
                                  aria-hidden
                                >
                                  ·
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => onAddToCart(prato)}
                                title={`Adicionar ${prato.nome} ao carrinho`}
                                aria-label={`Adicionar ${prato.nome} ao carrinho`}
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xl font-light leading-none text-white shadow-md transition-transform duration-150 hover:bg-zinc-800 hover:shadow-lg active:scale-95"
                              >
                                <span aria-hidden>+</span>
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
