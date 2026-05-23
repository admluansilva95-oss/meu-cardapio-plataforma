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

function mapRestauranteRow(row: {
  id: string;
  nome: string;
  slug: string;
  whatsapp: string;
  logo: string | null;
  cor_tema: string;
}): Restaurante {
  return {
    id: row.id,
    nome: row.nome,
    slug: row.slug,
    whatsapp: row.whatsapp,
    logo: row.logo ?? null,
    cor_tema: row.cor_tema,
  };
}

function mapPratoRow(row: {
  id: string;
  restaurante_id: string;
  nome: string;
  preco: string | number;
  descricao: string | null;
  imagem?: string | null;
  categoria?: string | null;
  status: string;
}): Prato | null {
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
      setError("Slug inválido.");
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

      const rest = mapRestauranteRow(restRow);
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
        .map((r) => mapPratoRow(r as Parameters<typeof mapPratoRow>[0]))
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

  const waHref = useMemo(() => {
    if (!restaurante || cart.length === 0) return null;
    const msg = buildPedidoTexto(restaurante, cart);
    const d = digitsOnly(restaurante.whatsapp);
    if (!d) return null;
    return waMeUrl(restaurante.whatsapp, msg);
  }, [restaurante, cart]);

  const accent = restaurante?.cor_tema?.trim() || "#14b8a6";

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
    setCartOpen(true);
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
      <div className="flex min-h-screen items-center justify-center bg-[#07080c] px-6 text-zinc-300">
        <p className="text-sm">URL inválida.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#07080c] text-zinc-100">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_600px_at_20%_-10%,rgba(45,212,191,0.14),transparent_55%),radial-gradient(900px_500px_at_100%_0%,rgba(99,102,241,0.12),transparent_50%)]"
        />
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-4 px-6">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-teal-400"
            style={{ borderTopColor: accent }}
          />
          <p className="text-sm text-zinc-400">Carregando cardápio…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#07080c] px-6 py-16 text-zinc-100">
        <div className="mx-auto max-w-md rounded-3xl border border-red-500/25 bg-red-950/30 p-8 text-center">
          <p className="text-sm font-medium text-red-200">Não foi possível carregar</p>
          <p className="mt-2 text-sm text-red-100/80">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-6 rounded-2xl bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!restaurante) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#07080c] px-6 py-20 text-zinc-100">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_600px_at_20%_-10%,rgba(45,212,191,0.12),transparent_55%)]"
        />
        <div className="relative z-10 mx-auto max-w-lg text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Restaurante não encontrado</h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Não há cardápio cadastrado para <span className="font-mono text-teal-300/90">/{slug}</span>.
            Confira o link ou entre em contato com o estabelecimento.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex rounded-2xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/10"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07080c] text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_600px_at_20%_-10%,rgba(45,212,191,0.16),transparent_55%),radial-gradient(900px_500px_at_100%_0%,rgba(99,102,241,0.12),transparent_50%),radial-gradient(800px_400px_at_50%_120%,rgba(244,244,245,0.05),transparent_45%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.03),transparent_40%,rgba(0,0,0,0.45))]"
      />

      <header className="relative z-10 border-b border-white/[0.06] bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:py-12">
          <div className="flex items-center gap-5">
            <div
              className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/80 text-2xl font-bold text-zinc-400 shadow-lg ring-1 ring-white/5"
              style={{
                boxShadow: `0 0 0 1px color-mix(in srgb, ${accent} 35%, transparent), 0 20px 50px -24px rgba(0,0,0,0.8)`,
              }}
            >
              {restaurante.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={restaurante.logo}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span aria-hidden className="text-zinc-500">
                  {restaurante.nome.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-300/85">
                Cardápio online
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {restaurante.nome}
              </h1>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-400">
                Monte seu pedido e envie direto pelo WhatsApp. Itens com preço sujeito à confirmação
                no balcão.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="inline-flex items-center justify-center gap-2 self-start rounded-2xl px-5 py-3 text-sm font-semibold text-zinc-950 shadow-lg transition hover:brightness-105 active:scale-[0.99] sm:self-center"
            style={{
              backgroundImage: `linear-gradient(135deg, ${accent}, #0f766e)`,
              boxShadow: `0 16px 40px -18px color-mix(in srgb, ${accent} 55%, transparent)`,
            }}
          >
            <span>Carrinho</span>
            {cart.length > 0 ? (
              <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs font-bold text-white">
                {cart.reduce((n, x) => n + x.quantidade, 0)}
              </span>
            ) : null}
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-5 py-12 pb-36">
        {pratos.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center text-sm text-zinc-500">
            Este restaurante ainda não publicou itens ativos no cardápio.
          </p>
        ) : (
          <div className="space-y-14">
            {categorias.map(([titulo, lista]) => (
              <section key={titulo} aria-labelledby={`cat-${titulo}`}>
                <h2
                  id={`cat-${titulo}`}
                  className="mb-6 flex items-center gap-3 text-lg font-semibold tracking-tight text-white"
                >
                  <span
                    className="h-px flex-1 max-w-[3rem] rounded-full bg-gradient-to-r from-transparent to-white/25"
                    aria-hidden
                  />
                  {titulo}
                  <span
                    className="h-px flex-1 rounded-full bg-gradient-to-l from-transparent to-white/25"
                    aria-hidden
                  />
                </h2>
                <ul className="grid gap-5 sm:grid-cols-2">
                  {lista.map((prato) => (
                    <li
                      key={prato.id}
                      className="group flex flex-col overflow-hidden rounded-3xl border border-white/[0.07] bg-zinc-950/50 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.04] transition hover:border-white/12 hover:bg-zinc-950/70"
                    >
                      <div className="relative aspect-[16/10] w-full overflow-hidden bg-zinc-900/80">
                        {prato.imagem ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={prato.imagem}
                            alt=""
                            className="h-full w-full object-cover opacity-95 transition duration-500 group-hover:scale-[1.03] group-hover:opacity-100"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-zinc-600">
                            <span className="text-4xl opacity-40" aria-hidden>
                              ◆
                            </span>
                          </div>
                        )}
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#07080c] via-transparent to-transparent opacity-90" />
                        <p className="absolute bottom-3 left-4 right-4 text-lg font-semibold text-white drop-shadow-md">
                          {prato.nome}
                        </p>
                      </div>
                      <div className="flex flex-1 flex-col gap-3 p-5">
                        {prato.descricao ? (
                          <p className="line-clamp-3 text-sm leading-relaxed text-zinc-400">
                            {prato.descricao}
                          </p>
                        ) : (
                          <p className="text-sm italic text-zinc-600">Sem descrição</p>
                        )}
                        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-white/[0.06] pt-4">
                          <p className="text-lg font-semibold text-teal-300/95">
                            {formatBRL(prato.preco)}
                          </p>
                          <button
                            type="button"
                            onClick={() => addToCart(prato)}
                            className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
                          >
                            Adicionar ao carrinho
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Barra fixa resumo */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-5 pt-2 sm:pb-6">
        <div className="pointer-events-auto flex w-full max-w-lg items-center justify-between gap-3 rounded-2xl border border-white/10 bg-zinc-950/90 px-4 py-3 shadow-2xl shadow-black/60 backdrop-blur-xl">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Total</p>
            <p className="text-lg font-bold text-white">{formatBRL(total)}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/10"
            >
              Ver carrinho
            </button>
            {waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-lg transition hover:brightness-105 ${
                  cart.length === 0 ? "pointer-events-none opacity-40" : ""
                }`}
                style={{
                  backgroundImage: `linear-gradient(135deg, ${accent}, #0f766e)`,
                }}
                aria-disabled={cart.length === 0}
              >
                WhatsApp
              </a>
            ) : (
              <span className="rounded-xl bg-zinc-800 px-4 py-2.5 text-sm text-zinc-500">
                WhatsApp indisponível
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Painel carrinho */}
      {cartOpen ? (
        <div className="fixed inset-0 z-30 flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            aria-label="Fechar carrinho"
            onClick={() => setCartOpen(false)}
          />
          <aside
            className="relative flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0a0b10] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-title"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h2 id="cart-title" className="text-lg font-semibold text-white">
                Seu pedido
              </h2>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="rounded-xl p-2 text-zinc-400 transition hover:bg-white/5 hover:text-white"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {cart.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center text-sm text-zinc-500">
                  Carrinho vazio. Toque em &quot;Adicionar ao carrinho&quot; nos pratos.
                </p>
              ) : (
                <ul className="space-y-3">
                  {cart.map(({ prato, quantidade }) => (
                    <li
                      key={prato.id}
                      className="flex gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-white">{prato.nome}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {formatBRL(prato.preco)} cada · subtotal{" "}
                          {formatBRL(prato.preco * quantidade)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-zinc-300 hover:bg-white/5"
                          onClick={() => setQty(prato.id, quantidade - 1)}
                          aria-label="Diminuir"
                        >
                          −
                        </button>
                        <span className="w-7 text-center text-sm font-semibold">{quantidade}</span>
                        <button
                          type="button"
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-zinc-300 hover:bg-white/5"
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

            <div className="border-t border-white/10 bg-black/30 px-5 py-5">
              <div className="mb-4 flex items-center justify-between text-sm">
                <span className="text-zinc-400">Total estimado</span>
                <span className="text-xl font-bold text-white">{formatBRL(total)}</span>
              </div>
              {waHref && cart.length > 0 ? (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center rounded-2xl py-3.5 text-sm font-semibold text-zinc-950 shadow-lg transition hover:brightness-105"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${accent}, #0f766e)`,
                  }}
                >
                  Enviar pedido no WhatsApp
                </a>
              ) : (
                <p className="text-center text-xs text-zinc-500">
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

