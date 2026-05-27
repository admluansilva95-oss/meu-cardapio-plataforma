"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { CarrinhoItem, Prato, Restaurante } from "@/types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function digitsOnly(input: string) {
  return input.replace(/\D/g, "");
}

/** Mesma convenção do painel admin: prefixa 55 quando faltar DDI. */
function waMeUrl(telefone: string, message: string) {
  let d = digitsOnly(telefone);
  if (d.length === 11 && !d.startsWith("55")) {
    d = `55${d}`;
  }
  if (d.length === 10 && !d.startsWith("55")) {
    d = `55${d}`;
  }
  const text = encodeURIComponent(message);
  return `https://wa.me/${d}?text=${text}`;
}

function buildPedidoTexto(restaurante: Restaurante, itens: CarrinhoItem[]) {
  const linhasItens = itens.map(({ prato, quantidade }) => {
    const sub = prato.preco * quantidade;
    return `• ${quantidade}x ${prato.nome} — ${formatBRL(sub)}`;
  });
  const total = itens.reduce((acc, { prato, quantidade }) => acc + prato.preco * quantidade, 0);

  return [
    `Olá! Gostaria de fazer um pedido no *${restaurante.nome}*`,
    "",
    ...linhasItens,
    "",
    `*Total:* ${formatBRL(total)}`,
  ].join("\n");
}

type RestauranteRow = {
  id: string;
  nome: string;
  slug: string;
  whatsapp: string;
  logo: string | null;
  cor_tema: string;
};

function mapRestauranteRow(row: RestauranteRow): Restaurante {
  return {
    id: row.id,
    nome: row.nome,
    slug: row.slug,
    whatsapp: row.whatsapp,
    logo: row.logo ?? null,
    cor_tema: row.cor_tema,
  };
}

type PratoRow = {
  id: string;
  restaurante_id: string;
  nome: string;
  preco: string | number;
  descricao: string | null;
  imagem?: string | null;
  categoria?: string | null;
  status: string;
};

function mapPratoRow(row: PratoRow): Prato | null {
  if (row.status !== "ativo") return null;
  return {
    id: row.id,
    restaurante_id: row.restaurante_id,
    nome: row.nome,
    preco: toNumber(row.preco),
    descricao: row.descricao,
    imagem: row.imagem ?? null,
    categoria: row.categoria?.trim() || null,
    status: "ativo",
  };
}

function cartStorageKey(slug: string) {
  return `meu-cardapio:v1:cart:${slug}`;
}

function bucketName(p: Prato): string {
  const c = p.categoria?.trim();
  return c && c.length > 0 ? c : "Cardápio";
}

function groupPratosByCategoria(pratos: Prato[]): [string, Prato[]][] {
  const map = new Map<string, Prato[]>();
  for (const p of pratos) {
    const k = bucketName(p);
    const arr = map.get(k) ?? [];
    arr.push(p);
    map.set(k, arr);
  }
  for (const [, arr] of map) {
    arr.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }
  const keys = [...map.keys()].sort((a, b) => {
    if (a === "Cardápio" && b !== "Cardápio") return 1;
    if (b === "Cardápio" && a !== "Cardápio") return -1;
    return a.localeCompare(b, "pt-BR");
  });
  return keys.map((k) => [k, map.get(k)!]);
}

type StoredCartLine = { i: string; q: number };

function CartIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={props.className}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h15l-1.5 9h-12z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6 5 3H2" />
      <circle cx="9" cy="20" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="18" cy="20" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

const shellClass =
  "min-h-screen bg-[#f5f5f7] font-sans text-[#1d1d1f] antialiased selection:bg-black/10";

function RestauranteNaoEncontradoView(props: { subtitle?: string }) {
  return (
    <div className={`${shellClass} flex flex-col items-center justify-center px-8 py-24`}>
      <div className="mx-auto max-w-md text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#86868b]">Cardápio</p>
        <h1 className="mt-4 text-[1.75rem] font-semibold tracking-tight text-[#1d1d1f] sm:text-3xl">
          Restaurante não encontrado
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-[#6e6e73]">
          {props.subtitle ??
            "Não encontramos um cardápio para este endereço. Confira o link ou peça um novo convite ao estabelecimento."}
        </p>
        <Link
          href="/"
          className="mt-12 inline-flex rounded-full bg-[#1d1d1f] px-8 py-3 text-sm font-semibold text-white transition hover:bg-black"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}

export default function PublicCardapioPage() {
  const params = useParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";

  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restaurante, setRestaurante] = useState<Restaurante | null>(null);
  const [pratos, setPratos] = useState<Prato[]>([]);

  const [cart, setCart] = useState<CarrinhoItem[]>([]);
  const [cartHydrated, setCartHydrated] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const fetchAbort = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!slug) {
      setLoading(false);
      setError(null);
      setRestaurante(null);
      setPratos([]);
      return;
    }

    fetchAbort.current?.abort();
    const ac = new AbortController();
    fetchAbort.current = ac;

    setLoading(true);
    setError(null);

    try {
      const { data: restRow, error: restErr } = await supabase
        .from("restaurantes")
        .select("id, nome, slug, whatsapp, logo, cor_tema")
        .eq("slug", slug)
        .maybeSingle();

      if (ac.signal.aborted) return;

      if (restErr) {
        setError(restErr.message);
        setRestaurante(null);
        setPratos([]);
        return;
      }

      if (!restRow) {
        setError(null);
        setRestaurante(null);
        setPratos([]);
        return;
      }

      const rest = mapRestauranteRow(restRow as RestauranteRow);
      setRestaurante(rest);

      const { data: pratosData, error: pratosErr } = await supabase
        .from("pratos")
        .select("id, restaurante_id, nome, preco, descricao, imagem, status, categoria")
        .eq("restaurante_id", rest.id)
        .eq("status", "ativo")
        .order("nome", { ascending: true });

      if (ac.signal.aborted) return;

      if (pratosErr) {
        setError(pratosErr.message);
        setPratos([]);
        return;
      }

      const mapped = (pratosData ?? [])
        .map((r) => mapPratoRow(r as PratoRow))
        .filter((p): p is Prato => p !== null);
      setPratos(mapped);
    } catch (e) {
      if (!ac.signal.aborted) {
        setError(e instanceof Error ? e.message : "Erro ao carregar o cardápio.");
        setRestaurante(null);
        setPratos([]);
      }
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [slug, supabase]);

  useEffect(() => {
    void load();
    return () => fetchAbort.current?.abort();
  }, [load]);

  useEffect(() => {
    if (!slug) return;
    setCart([]);
    setCartHydrated(false);
  }, [slug]);

  useEffect(() => {
    if (!slug || !restaurante || loading) return;

    if (pratos.length === 0) {
      setCart([]);
      setCartHydrated(true);
      return;
    }

    try {
      const raw = localStorage.getItem(cartStorageKey(slug));
      if (!raw) {
        setCart([]);
        setCartHydrated(true);
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        setCart([]);
        setCartHydrated(true);
        return;
      }
      const byId = new Map(pratos.map((p) => [p.id, p]));
      const next: CarrinhoItem[] = [];
      for (const row of parsed as StoredCartLine[]) {
        if (!row || typeof row.i !== "string") continue;
        const prato = byId.get(row.i);
        const q = Math.floor(Number(row.q));
        if (prato && q > 0) next.push({ prato, quantidade: q });
      }
      setCart(next);
    } catch {
      setCart([]);
    } finally {
      setCartHydrated(true);
    }
  }, [slug, restaurante, pratos, loading]);

  useEffect(() => {
    if (!cartHydrated || !slug) return;
    const payload: StoredCartLine[] = cart.map(({ prato, quantidade }) => ({
      i: prato.id,
      q: quantidade,
    }));
    try {
      localStorage.setItem(cartStorageKey(slug), JSON.stringify(payload));
    } catch {
      /* storage cheio ou indisponível */
    }
  }, [cart, cartHydrated, slug]);

  useEffect(() => {
    if (restaurante?.nome) {
      document.title = `${restaurante.nome} · Cardápio`;
    } else {
      document.title = "Cardápio";
    }
  }, [restaurante?.nome]);

  const categorias = useMemo(() => groupPratosByCategoria(pratos), [pratos]);

  const total = useMemo(
    () => cart.reduce((acc, { prato, quantidade }) => acc + prato.preco * quantidade, 0),
    [cart],
  );

  const cartCount = useMemo(() => cart.reduce((n, x) => n + x.quantidade, 0), [cart]);

  const waHref = useMemo(() => {
    if (!restaurante || cart.length === 0) return null;
    const msg = buildPedidoTexto(restaurante, cart);
    const d = digitsOnly(restaurante.whatsapp);
    if (!d) return null;
    return waMeUrl(restaurante.whatsapp, msg);
  }, [restaurante, cart]);

  const accent = restaurante?.cor_tema?.trim() || "#1d1d1f";

  const addToCart = (prato: Prato) => {
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.prato.id === prato.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantidade: copy[idx].quantidade + 1 };
        return copy;
      }
      return [...prev, { prato, quantidade: 1 }];
    });
  };

  const setQty = (pratoId: string, quantidade: number) => {
    if (quantidade < 1) {
      setCart((prev) => prev.filter((x) => x.prato.id !== pratoId));
      return;
    }
    setCart((prev) =>
      prev.map((x) => (x.prato.id === pratoId ? { ...x, quantidade } : x)),
    );
  };

  if (!slug) {
    return (
      <RestauranteNaoEncontradoView subtitle="O endereço desta página não é válido. Verifique o link e tente novamente." />
    );
  }

  if (loading) {
    return (
      <div className={`${shellClass} flex flex-col items-center justify-center gap-5 px-6`}>
        <div
          className="h-9 w-9 animate-spin rounded-full border-2 border-black/[0.08]"
          style={{ borderTopColor: accent }}
          aria-hidden
        />
        <p className="text-sm font-medium text-[#6e6e73]">Carregando cardápio…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${shellClass} px-6 py-20`}>
        <div className="mx-auto max-w-md rounded-2xl border border-black/[0.06] bg-white p-8 text-center shadow-[0_20px_60px_-30px_rgba(0,0,0,0.2)]">
          <p className="text-sm font-semibold tracking-tight text-[#1d1d1f]">Não foi possível carregar</p>
          <p className="mt-2 text-sm leading-relaxed text-[#6e6e73]">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-8 rounded-xl bg-[#1d1d1f] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-black"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!restaurante) {
    return <RestauranteNaoEncontradoView />;
  }

  return (
    <div className={shellClass}>
      <header className="border-b border-black/[0.06] bg-[#fbfbfd]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-12 sm:flex-row sm:items-end sm:justify-between sm:px-8 sm:py-16">
          <div className="flex items-start gap-6 sm:items-center">
            <div
              className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-black/[0.06] bg-white text-2xl font-semibold tracking-tight text-[#86868b] shadow-[0_12px_40px_-20px_rgba(0,0,0,0.25)] sm:h-24 sm:w-24 sm:rounded-[1.35rem] sm:text-3xl"
              style={{
                boxShadow: `0 0 0 1px color-mix(in srgb, ${accent} 22%, transparent), 0 18px 50px -28px rgba(0,0,0,0.35)`,
              }}
            >
              {restaurante.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={restaurante.logo} alt="" className="h-full w-full object-cover" />
              ) : (
                <span aria-hidden>{restaurante.nome.slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#86868b]">Cardápio</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#1d1d1f] sm:text-[2.35rem] sm:leading-tight">
                {restaurante.nome}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#6e6e73]">
                Seleção curada. Monte seu pedido com calma; finalize no carrinho e envie pelo WhatsApp.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-32 pt-12 sm:px-8 sm:pb-36 sm:pt-14">
        {pratos.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-black/[0.1] bg-white px-6 py-16 text-center text-sm text-[#86868b] shadow-[0_8px_30px_-24px_rgba(0,0,0,0.15)]">
            Este restaurante ainda não publicou itens ativos no cardápio.
          </p>
        ) : (
          <div className="space-y-16 sm:space-y-20">
            {categorias.map(([titulo, lista]) => (
              <section key={titulo} aria-labelledby={`cat-${titulo}`} className="scroll-mt-24">
                <div className="mb-8 flex items-baseline justify-between gap-4 border-b border-black/[0.06] pb-4">
                  <h2
                    id={`cat-${titulo}`}
                    className="text-xs font-semibold uppercase tracking-[0.22em] text-[#86868b]"
                  >
                    {titulo}
                  </h2>
                  <span className="text-[11px] font-medium tabular-nums text-[#aeaeb2]">{lista.length}</span>
                </div>
                <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2 lg:gap-8">
                  {lista.map((prato) => (
                    <li key={prato.id}>
                      <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-[0_16px_50px_-36px_rgba(0,0,0,0.35)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-32px_rgba(0,0,0,0.38)]">
                        <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#ececee]">
                          {prato.imagem ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={prato.imagem}
                              alt=""
                              className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.02]"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[#c7c7cc]">
                              <span className="text-4xl font-extralight" aria-hidden>
                                —
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col gap-3 p-6 sm:p-7">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <h3 className="text-lg font-semibold tracking-tight text-[#1d1d1f] sm:text-xl">
                              {prato.nome}
                            </h3>
                            <p className="shrink-0 text-base font-semibold tabular-nums tracking-tight text-[#1d1d1f]">
                              {formatBRL(prato.preco)}
                            </p>
                          </div>
                          {prato.descricao ? (
                            <p className="line-clamp-3 text-sm leading-relaxed text-[#6e6e73]">{prato.descricao}</p>
                          ) : (
                            <p className="text-sm italic text-[#aeaeb2]">Sem descrição</p>
                          )}
                          <div className="mt-auto pt-2">
                            <button
                              type="button"
                              onClick={() => addToCart(prato)}
                              className="w-full rounded-xl border border-black/[0.08] bg-[#f5f5f7] py-3 text-sm font-semibold text-[#1d1d1f] transition hover:bg-[#ececee] active:scale-[0.99] sm:w-auto sm:px-8"
                            >
                              Adicionar
                            </button>
                          </div>
                        </div>
                      </article>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-end px-5 sm:bottom-8 sm:px-8">
        <div className="pointer-events-auto flex flex-col items-end gap-3">
          {cartCount > 0 ? (
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="rounded-full border border-black/[0.06] bg-white/90 px-4 py-2 text-left text-xs font-medium text-[#6e6e73] shadow-[0_12px_40px_-20px_rgba(0,0,0,0.35)] backdrop-blur-xl transition hover:bg-white"
            >
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#aeaeb2]">Total</span>
              <span className="text-sm font-semibold tabular-nums text-[#1d1d1f]">{formatBRL(total)}</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[#1d1d1f] text-white shadow-[0_18px_50px_-18px_rgba(0,0,0,0.55)] transition hover:bg-black active:scale-[0.97]"
            style={{
              boxShadow: `0 18px 50px -18px color-mix(in srgb, ${accent} 45%, rgba(0,0,0,0.5))`,
            }}
            aria-label={cartCount > 0 ? `Abrir carrinho, ${cartCount} itens` : "Abrir carrinho"}
          >
            <CartIcon className="h-6 w-6" />
            {cartCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-[#1d1d1f] ring-2 ring-[#f5f5f7]">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {cartOpen ? (
        <div className="fixed inset-0 z-40 flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
            aria-label="Fechar carrinho"
            onClick={() => setCartOpen(false)}
          />
          <aside
            className="relative flex h-full w-full max-w-md flex-col border-l border-black/[0.06] bg-[#fbfbfd] shadow-[-24px_0_80px_-32px_rgba(0,0,0,0.35)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-title"
          >
            <div className="flex items-center justify-between border-b border-black/[0.06] px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#86868b]">Seu pedido</p>
                <h2 id="cart-title" className="mt-1 text-xl font-semibold tracking-tight text-[#1d1d1f]">
                  Carrinho
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-[#6e6e73] transition hover:bg-black/[0.05] hover:text-[#1d1d1f]"
                aria-label="Fechar"
              >
                <span className="text-lg leading-none">×</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {cart.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-black/[0.1] bg-white px-4 py-14 text-center text-sm leading-relaxed text-[#86868b]">
                  Carrinho vazio. Toque em &quot;Adicionar&quot; nos pratos que desejar.
                </p>
              ) : (
                <ul className="space-y-3">
                  {cart.map(({ prato, quantidade }) => (
                    <li
                      key={prato.id}
                      className="flex gap-4 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-[0_8px_24px_-18px_rgba(0,0,0,0.2)]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold tracking-tight text-[#1d1d1f]">{prato.nome}</p>
                        <p className="mt-1 text-xs text-[#86868b]">
                          {formatBRL(prato.preco)} cada · subtotal{" "}
                          <span className="font-medium text-[#424245]">{formatBRL(prato.preco * quantidade)}</span>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.08] bg-[#f5f5f7] text-[#1d1d1f] transition hover:bg-[#ececee]"
                          onClick={() => setQty(prato.id, quantidade - 1)}
                          aria-label="Diminuir"
                        >
                          −
                        </button>
                        <span className="w-8 text-center text-sm font-semibold tabular-nums">{quantidade}</span>
                        <button
                          type="button"
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.08] bg-[#f5f5f7] text-[#1d1d1f] transition hover:bg-[#ececee]"
                          onClick={() => setQty(prato.id, quantidade + 1)}
                          aria-label="Aumentar"
                        >
                          +
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-black/[0.06] bg-white/80 px-6 py-6 backdrop-blur-md">
              <div className="mb-5 flex items-end justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#86868b]">Total estimado</span>
                <span className="text-2xl font-semibold tabular-nums tracking-tight text-[#1d1d1f]">{formatBRL(total)}</span>
              </div>
              {waHref && cart.length > 0 ? (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center rounded-2xl py-3.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 active:scale-[0.99]"
                  style={{ backgroundColor: accent }}
                >
                  Enviar pedido no WhatsApp
                </a>
              ) : (
                <p className="text-center text-xs leading-relaxed text-[#86868b]">
                  {cart.length === 0
                    ? "Adicione itens para enviar o pedido."
                    : "Cadastre um WhatsApp válido no restaurante."}
                </p>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
