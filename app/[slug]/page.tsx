"use client";

import type { CarrinhoItem, Prato, Restaurante, EntregaModo } from "@/types";
import {
  taxaEntregaParaPedido,
  type TipoEntregaPedido,
} from "@/lib/restaurante/pedido-texto-whatsapp";
import {
  montarTextoPedidoWhatsAppFormatado,
  type FormaPagamentoPedidoCliente,
} from "@/lib/restaurante/pedido-whatsapp-formatado";
import { formatarTelefoneWhatsappBR, digitosTelefoneBR } from "@/lib/restaurante/br-telefone-mascara";
import { parsePrecoBrasileiro } from "@/lib/restaurante/preco-input";
import { statusAberturaPorRelogio, textoHorarioVitrine } from "@/lib/restaurante/horario-vitrine";
import { parseFuncionamentoSemana } from "@/lib/restaurante/funcionamento-semana";
import { parseTaxasEntregaZonas } from "@/lib/restaurante/taxas-entrega-zonas";
import {
  ordenarSecoesCardapio,
  parseCardapioCategorias,
  slugifySecaoCardapio,
} from "@/lib/restaurante/cardapio-categorias";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock, UtensilsCrossed } from "lucide-react";
import { isValidSlug } from "@/lib/billing/slug";
import { sanitizeFetchInit } from "@/lib/fetch-latin1-safe";
import { isRetryableSupabaseError, withRetry } from "@/lib/with-retry";

/** Após esgotar retries ou falha de rede, evita mensagens técnicas cruas para o cliente final. */
function mensagemErroCardapioParaCliente(message: string): string {
  if (
    isRetryableSupabaseError({ message }) ||
    /\b(50[0-4]|503|502|504|429|unavailable|timeout|network|fetch|gateway)\b/i.test(message)
  ) {
    return "O cardápio está temporariamente indisponível. Tente novamente em alguns instantes.";
  }
  return message;
}

function formatSlugToDisplayName(slug: string): string {
  const s = slug.trim();
  if (!s) return "Restaurante";
  return s
    .split(/[-_]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

function resolveRestauranteDisplayNome(nome: string | null | undefined, slug: string): string {
  const t = nome?.trim();
  if (t) return t;
  return formatSlugToDisplayName(slug);
}

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

type RestauranteRow = {
  id: string;
  nome: string;
  slug: string;
  whatsapp: string;
  logo: string | null;
  cor_tema: string;
  horario_funcionamento?: string | null;
  taxa_entrega?: string | number | null;
  vitrine_fechada?: boolean | null;
  mensagem_fechado?: string | null;
  funcionamento_semana?: unknown;
  taxas_entrega_zonas?: unknown;
  entrega_modo?: string | null;
  retirada_balcao?: boolean | null;
  cardapio_categorias?: unknown;
  mensagem_boas_vindas?: string | null;
  texto_vitrine_aberto?: string | null;
  texto_vitrine_fechado?: string | null;
  mensagem_fora_horario?: string | null;
};

function mapRestauranteRow(row: RestauranteRow): Restaurante {
  const rawNome = row.nome?.trim() ?? "";
  const taxaRaw = row.taxa_entrega;
  const taxaEntrega =
    taxaRaw == null || taxaRaw === ""
      ? null
      : Math.max(0, Math.round(toNumber(taxaRaw) * 100) / 100);
  const zonasParsed = parseTaxasEntregaZonas(row.taxas_entrega_zonas);
  const rawModo = row.entrega_modo;
  const entrega_modo: EntregaModo =
    rawModo === "zonas" || rawModo === "fixa"
      ? rawModo
      : zonasParsed && zonasParsed.length > 1
        ? "zonas"
        : "fixa";
  const cardapio_categorias = parseCardapioCategorias(row.cardapio_categorias);
  return {
    id: row.id,
    rawNome,
    nome: resolveRestauranteDisplayNome(row.nome, row.slug),
    slug: row.slug,
    whatsapp: row.whatsapp?.trim() || "+5500000000000",
    logo: row.logo ?? null,
    cor_tema: row.cor_tema?.trim() || "#0d9488",
    horario_funcionamento: row.horario_funcionamento?.trim() || null,
    taxa_entrega: taxaEntrega,
    vitrine_fechada: row.vitrine_fechada === true,
    mensagem_fechado: row.mensagem_fechado?.trim() || null,
    funcionamento_semana: parseFuncionamentoSemana(row.funcionamento_semana) ?? undefined,
    taxas_entrega_zonas: zonasParsed ?? undefined,
    entrega_modo,
    retirada_balcao: row.retirada_balcao === true,
    cardapio_categorias: cardapio_categorias.length > 0 ? cardapio_categorias : null,
    mensagem_boas_vindas: row.mensagem_boas_vindas?.trim() || null,
    texto_vitrine_aberto: row.texto_vitrine_aberto?.trim() || null,
    texto_vitrine_fechado: row.texto_vitrine_fechado?.trim() || null,
    mensagem_fora_horario: row.mensagem_fora_horario?.trim() || null,
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

function PratoCoverImage(props: { src: string | null; nome: string }) {
  const [failed, setFailed] = useState(false);
  if (!props.src || failed) {
    return (
      <div className="flex h-full min-h-[10.5rem] w-full flex-col items-center justify-center bg-gradient-to-b from-zinc-100 via-zinc-50 to-zinc-100">
        <UtensilsCrossed className="h-10 w-10 text-zinc-300/95" strokeWidth={1.15} aria-hidden />
        <span className="sr-only">{props.nome}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={props.src}
      alt=""
      className="h-full w-full object-cover transition duration-500 ease-out group-hover:scale-[1.03]"
      onError={() => setFailed(true)}
    />
  );
}

function cartStorageKey(slug: string) {
  return `meu-cardapio:v1:cart:${slug}`;
}

function cartZonaStorageKey(slug: string) {
  return `meu-cardapio:v1:cartZona:${slug}`;
}

function cartTipoEntregaStorageKey(slug: string) {
  return `meu-cardapio:v1:cartTipoEntrega:${slug}`;
}

type StoredCartLine = { i: string; q: number; o?: string };

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
  "min-h-screen scroll-smooth bg-zinc-50 font-sans text-zinc-900 antialiased selection:bg-zinc-900/10";

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
  const rawSlug = params?.slug;
  const slug =
    typeof rawSlug === "string"
      ? rawSlug
      : Array.isArray(rawSlug)
        ? (rawSlug[0] ?? "")
        : "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restaurante, setRestaurante] = useState<Restaurante | null>(null);
  const [pratos, setPratos] = useState<Prato[]>([]);

  const [cart, setCart] = useState<CarrinhoItem[]>([]);
  const [cartHydrated, setCartHydrated] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [zonaEntregaId, setZonaEntregaId] = useState<string | null>(null);
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntregaPedido>("entrega");
  const [activeCategoriaId, setActiveCategoriaId] = useState<string | null>(null);
  const [agoraTick, setAgoraTick] = useState(() => Date.now());

  const [clienteNome, setClienteNome] = useState("");
  const [clienteTelefoneDisplay, setClienteTelefoneDisplay] = useState("");
  const [checkoutRua, setCheckoutRua] = useState("");
  const [checkoutNumero, setCheckoutNumero] = useState("");
  const [checkoutComplemento, setCheckoutComplemento] = useState("");
  /** Bairros vêm das taxas cadastradas no restaurante (mesma “cidade”/área de atendimento). */
  const [entregaBairroModo, setEntregaBairroModo] = useState<"digitar" | "lista">("digitar");
  const [bairroBuscaTexto, setBairroBuscaTexto] = useState("");
  const [bairroLivreTexto, setBairroLivreTexto] = useState("");
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamentoPedidoCliente>("pix");
  const [trocoParaInput, setTrocoParaInput] = useState("");
  const [checkoutErro, setCheckoutErro] = useState<string | null>(null);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);

  const fetchAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setAgoraTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    if (!slug || !isValidSlug(slug)) {
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
      const result = await withRetry(
        async () => {
          try {
            const res = await fetch(
              `/api/public/cardapio?slug=${encodeURIComponent(slug)}`,
              { method: "GET", cache: "no-store", credentials: "omit" },
            );
            let body: unknown = {};
            try {
              body = await res.json();
            } catch {
              body = {};
            }
            const b = body as { error?: string; restaurante?: unknown; pratos?: unknown };
            if (!res.ok) {
              return {
                data: null as { restaurante: RestauranteRow | null; pratos: unknown[] } | null,
                error: { message: b.error ?? `Erro ${res.status}` },
              };
            }
            return {
              data: {
                restaurante: (b.restaurante ?? null) as RestauranteRow | null,
                pratos: Array.isArray(b.pratos) ? b.pratos : [],
              },
              error: null as { message: string } | null,
            };
          } catch (e) {
            return {
              data: null,
              error: { message: e instanceof Error ? e.message : "Falha de rede." },
            };
          }
        },
        { shouldRetry: (r) => isRetryableSupabaseError(r.error) },
      );

      if (ac.signal.aborted) return;

      if (result.error) {
        setError(mensagemErroCardapioParaCliente(result.error.message ?? "Erro ao carregar."));
        setRestaurante(null);
        setPratos([]);
        return;
      }

      const payload = result.data;
      if (!payload?.restaurante) {
        setError(null);
        setRestaurante(null);
        setPratos([]);
        return;
      }

      const rest = mapRestauranteRow(payload.restaurante);
      setRestaurante(rest);

      const mapped = payload.pratos
        .map((r) => mapPratoRow(r as PratoRow))
        .filter((p): p is Prato => p !== null);
      setPratos(mapped);
    } catch (e) {
      if (!ac.signal.aborted) {
        const raw = e instanceof Error ? e.message : "Erro ao carregar o cardápio.";
        setError(mensagemErroCardapioParaCliente(raw));
        setRestaurante(null);
        setPratos([]);
      }
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
    return () => fetchAbort.current?.abort();
  }, [load]);

  useEffect(() => {
    if (!slug) return;
    setCart([]);
    setCartHydrated(false);
    setZonaEntregaId(null);
    setTipoEntrega("entrega");
    setActiveCategoriaId(null);
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
        if (prato && q > 0) {
          const obs =
            typeof row.o === "string" && row.o.trim() ? row.o.trim().slice(0, 400) : null;
          next.push({ prato, quantidade: q, observacoes: obs });
        }
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
    const payload: StoredCartLine[] = cart.map(({ prato, quantidade, observacoes }) => {
      const o = observacoes?.trim();
      return o
        ? { i: prato.id, q: quantidade, o: o.slice(0, 400) }
        : { i: prato.id, q: quantidade };
    });
    try {
      localStorage.setItem(cartStorageKey(slug), JSON.stringify(payload));
    } catch {
      /* storage cheio ou indisponível */
    }
  }, [cart, cartHydrated, slug]);

  useEffect(() => {
    if (restaurante?.nome) {
      document.title = `${restaurante.nome} · Cardápio`;
    } else if (slug) {
      document.title = `${formatSlugToDisplayName(slug)} · Cardápio`;
    } else {
      document.title = "Cardápio";
    }
  }, [restaurante?.nome, slug]);

  useEffect(() => {
    if (!restaurante) return;
    const zonas = restaurante.taxas_entrega_zonas ?? [];
    if (zonas.length === 1) {
      setZonaEntregaId(zonas[0].id);
      return;
    }
    if (zonas.length === 0) {
      setZonaEntregaId(null);
      return;
    }
    if (!slug) return;
    try {
      const stored = localStorage.getItem(cartZonaStorageKey(slug));
      if (stored && zonas.some((x) => x.id === stored)) {
        setZonaEntregaId(stored);
      } else {
        setZonaEntregaId(null);
      }
    } catch {
      setZonaEntregaId(null);
    }
  }, [restaurante, slug]);

  useEffect(() => {
    if (!restaurante) return;
    const n = restaurante.taxas_entrega_zonas?.length ?? 0;
    setBairroBuscaTexto("");
    setBairroLivreTexto("");
    setEntregaBairroModo(n > 1 ? "digitar" : "lista");
  }, [restaurante?.id, restaurante?.taxas_entrega_zonas]);

  useEffect(() => {
    if (!slug || !cartHydrated || !restaurante) return;
    const zonas = restaurante.taxas_entrega_zonas ?? [];
    if (zonas.length <= 1) return;
    try {
      if (zonaEntregaId) {
        localStorage.setItem(cartZonaStorageKey(slug), zonaEntregaId);
      } else {
        localStorage.removeItem(cartZonaStorageKey(slug));
      }
    } catch {
      /* ignore */
    }
  }, [zonaEntregaId, slug, restaurante, cartHydrated]);

  useEffect(() => {
    if (!slug || !cartHydrated || !restaurante) return;
    try {
      if (restaurante.retirada_balcao) {
        localStorage.setItem(cartTipoEntregaStorageKey(slug), tipoEntrega);
      } else {
        localStorage.removeItem(cartTipoEntregaStorageKey(slug));
      }
    } catch {
      /* ignore */
    }
  }, [tipoEntrega, slug, restaurante, cartHydrated]);

  useEffect(() => {
    if (!slug || !restaurante || !cartHydrated) return;
    if (!restaurante.retirada_balcao) {
      setTipoEntrega("entrega");
      return;
    }
    try {
      const raw = localStorage.getItem(cartTipoEntregaStorageKey(slug));
      if (raw === "retirada" || raw === "entrega") setTipoEntrega(raw);
      else setTipoEntrega("entrega");
    } catch {
      setTipoEntrega("entrega");
    }
  }, [slug, restaurante, cartHydrated]);

  const categorias = useMemo(
    () => ordenarSecoesCardapio(restaurante?.cardapio_categorias ?? null, pratos),
    [restaurante?.cardapio_categorias, pratos],
  );

  const relogio = useMemo(() => new Date(agoraTick), [agoraTick]);
  const foraDoHorario = useMemo(() => {
    if (!restaurante) return false;
    return statusAberturaPorRelogio(restaurante, relogio) === "fechado";
  }, [restaurante, relogio]);
  const pedidosBloqueados = useMemo(
    () => Boolean(restaurante?.vitrine_fechada) || foraDoHorario,
    [restaurante?.vitrine_fechada, foraDoHorario],
  );

  useEffect(() => {
    if (categorias.length === 0) return;
    setActiveCategoriaId((prev) => prev ?? `sec-${slugifySecaoCardapio(categorias[0].titulo)}`);
  }, [categorias]);

  useEffect(() => {
    if (!slug || !restaurante || categorias.length === 0) return;
    const elements = categorias
      .map(({ titulo }) => document.getElementById(`sec-${slugifySecaoCardapio(titulo)}`))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!elements.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting && e.target.id)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const id = visible[0]?.target.id;
        if (id) setActiveCategoriaId(id);
      },
      { threshold: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.35, 0.5, 0.65], rootMargin: "-96px 0px -42% 0px" },
    );
    elements.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [slug, restaurante?.id, categorias, pratos.length]);

  const subtotalCarrinho = useMemo(
    () => cart.reduce((acc, { prato, quantidade }) => acc + prato.preco * quantidade, 0),
    [cart],
  );

  const taxaCarrinho = useMemo(() => {
    if (!restaurante || cart.length === 0) return 0;
    return taxaEntregaParaPedido(restaurante, zonaEntregaId, { tipo: tipoEntrega }).valor;
  }, [restaurante, cart.length, zonaEntregaId, tipoEntrega]);

  const total = subtotalCarrinho + taxaCarrinho;

  const cartCount = useMemo(() => cart.reduce((n, x) => n + x.quantidade, 0), [cart]);

  const trocoParaValor = useMemo(
    () => (trocoParaInput.trim() ? parsePrecoBrasileiro(trocoParaInput) : null),
    [trocoParaInput],
  );

  const zonasEntrega = useMemo(
    () => restaurante?.taxas_entrega_zonas ?? [],
    [restaurante?.taxas_entrega_zonas],
  );

  const zonasFiltradasPorBusca = useMemo(() => {
    const q = bairroBuscaTexto.trim().toLowerCase();
    if (!q) return zonasEntrega;
    return zonasEntrega.filter((z) => z.nome.toLowerCase().includes(q));
  }, [zonasEntrega, bairroBuscaTexto]);

  useEffect(() => {
    if (!cartOpen) setCheckoutErro(null);
  }, [cartOpen]);

  const accent = restaurante?.cor_tema?.trim() || "#1d1d1f";

  const addToCart = (prato: Prato) => {
    if (restaurante && pedidosBloqueados) return;
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.prato.id === prato.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantidade: copy[idx].quantidade + 1 };
        return copy;
      }
      return [...prev, { prato, quantidade: 1, observacoes: null }];
    });
  };

  const setItemObservacoes = (pratoId: string, texto: string) => {
    const t = texto.slice(0, 400);
    setCart((prev) =>
      prev.map((x) => (x.prato.id === pratoId ? { ...x, observacoes: t.trim() ? t : null } : x)),
    );
  };

  const setQty = (pratoId: string, quantidade: number) => {
    if (restaurante && pedidosBloqueados) {
      const atual = cart.find((x) => x.prato.id === pratoId)?.quantidade ?? 0;
      if (quantidade > atual) return;
    }
    if (quantidade < 1) {
      setCart((prev) => prev.filter((x) => x.prato.id !== pratoId));
      return;
    }
    setCart((prev) =>
      prev.map((x) => (x.prato.id === pratoId ? { ...x, quantidade } : x)),
    );
  };

  const handleEnviarPedidoWhatsapp = useCallback(async () => {
    setCheckoutErro(null);
    if (!restaurante || cart.length === 0 || pedidosBloqueados) return;
    if (digitsOnly(restaurante.whatsapp).length < 10) {
      setCheckoutErro("Este cardápio não possui um WhatsApp válido para receber pedidos.");
      return;
    }
    const nomeOk = clienteNome.trim();
    const telDig = digitosTelefoneBR(clienteTelefoneDisplay);
    if (nomeOk.length < 3 || telDig.length < 10) {
      setCheckoutErro("Informe nome completo e telefone com DDD (10 ou 11 dígitos).");
      return;
    }
    const zonas = restaurante.taxas_entrega_zonas ?? [];
    if (tipoEntrega === "entrega") {
      if (!checkoutRua.trim() || !checkoutNumero.trim()) {
        setCheckoutErro("Preencha rua e número para a entrega.");
        return;
      }
      if (zonas.length > 1 && !zonaEntregaId) {
        setCheckoutErro("Selecione o bairro (busca ou lista) conforme as regiões atendidas pelo restaurante.");
        return;
      }
      if (zonas.length === 0 && bairroLivreTexto.trim().length < 2) {
        setCheckoutErro("Informe o bairro ou região da entrega.");
        return;
      }
    }
    const taxaBase = taxaEntregaParaPedido(restaurante, zonaEntregaId, { tipo: tipoEntrega }).valor;
    const taxaAplicada = cart.length > 0 ? taxaBase : 0;
    const subtotal = cart.reduce((acc, { prato, quantidade }) => acc + prato.preco * quantidade, 0);
    const totalGeral = subtotal + taxaAplicada;

    if (formaPagamento === "dinheiro" && trocoParaInput.trim()) {
      const p = parsePrecoBrasileiro(trocoParaInput);
      if (p == null) {
        setCheckoutErro("Valor de troco inválido. Use o formato brasileiro (ex.: 100,00).");
        return;
      }
      if (p < totalGeral) {
        setCheckoutErro("O valor para troco deve ser igual ou maior que o total do pedido.");
        return;
      }
    }

    const bairroNome =
      tipoEntrega === "retirada"
        ? "N/A"
        : zonas.length > 0
          ? zonas.find((z) => z.id === zonaEntregaId)?.nome?.trim() || "N/A"
          : bairroLivreTexto.trim() || "N/A";

    const enderecoLinha =
      tipoEntrega === "retirada" ? "N/A" : `${checkoutRua.trim()}, ${checkoutNumero.trim()}`;

    const refCompLinha =
      tipoEntrega === "retirada" ? "N/A" : checkoutComplemento.trim() || "N/A";

    const trocoParsed = trocoParaInput.trim() ? parsePrecoBrasileiro(trocoParaInput) : null;
    const trocoParaTexto =
      formaPagamento !== "dinheiro" || !trocoParaInput.trim()
        ? "Não necessário"
        : trocoParsed != null
          ? formatBRL(trocoParsed)
          : "Não necessário";

    const valorTrocoReais =
      formaPagamento === "dinheiro" && trocoParsed != null && trocoParsed >= totalGeral
        ? Math.round((trocoParsed - totalGeral) * 100) / 100
        : 0;

    const msg = montarTextoPedidoWhatsAppFormatado({
      nomeCliente: nomeOk,
      telefoneCliente: formatarTelefoneWhatsappBR(clienteTelefoneDisplay),
      tipoEntrega,
      enderecoLinha,
      bairroLinha: bairroNome,
      refCompLinha,
      itens: cart,
      formaPagamento,
      trocoParaTexto,
      valorTrocoReais,
      subtotalItens: subtotal,
      taxaEntrega: taxaAplicada,
      totalGeral,
    });

    const itensPedido = cart.map(({ prato, quantidade, observacoes }) => {
      const linha = `${quantidade}x ${prato.nome} (${formatBRL(prato.preco)} cada)`;
      const o = observacoes?.trim();
      return o ? `${linha} · Obs: ${o}` : linha;
    });

    setCheckoutSubmitting(true);
    try {
      const res = await fetch(
        "/api/pedidos/vitrine",
        sanitizeFetchInit({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            restauranteId: restaurante.id,
            cliente: nomeOk,
            telefone: formatarTelefoneWhatsappBR(clienteTelefoneDisplay),
            total: totalGeral,
            formaPagamento,
            itens: itensPedido,
            observacoes: msg,
          }),
        }),
      );
      let json: { ok?: boolean; error?: string } = {};
      try {
        json = (await res.json()) as { ok?: boolean; error?: string };
      } catch {
        json = {};
      }
      if (!res.ok || !json.ok) {
        setCheckoutErro(
          json.error ??
            (res.status === 503
              ? "Não foi possível registrar o pedido no servidor. Tente enviar pelo WhatsApp manualmente."
              : "Não foi possível registrar o pedido. Tente novamente."),
        );
        return;
      }
      const href = waMeUrl(restaurante.whatsapp, msg);
      window.open(href, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error("[checkout] falha ao registrar pedido:", e);
      setCheckoutErro("Falha de rede ao registrar o pedido. Verifique sua conexão e tente de novo.");
    } finally {
      setCheckoutSubmitting(false);
    }
  }, [
    restaurante,
    cart,
    pedidosBloqueados,
    clienteNome,
    clienteTelefoneDisplay,
    tipoEntrega,
    checkoutRua,
    checkoutNumero,
    checkoutComplemento,
    bairroLivreTexto,
    zonaEntregaId,
    formaPagamento,
    trocoParaInput,
    subtotalCarrinho,
    taxaCarrinho,
  ]);

  if (!slug) {
    return (
      <RestauranteNaoEncontradoView subtitle="O endereço desta página não é válido. Verifique o link e tente novamente." />
    );
  }

  if (!isValidSlug(slug)) {
    return (
      <RestauranteNaoEncontradoView subtitle="O link do cardápio não é válido. Use apenas letras minúsculas, números e hífens (ex.: casa-do-sabor)." />
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
          <p className="text-sm font-semibold tracking-tight text-[#1d1d1f]">Não foi possível carregar o cardápio</p>
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

  const vitrineFechada = restaurante.vitrine_fechada === true;
  const mensagemFechadoCustom = restaurante.mensagem_fechado?.trim() ?? "";

  const textoHor = textoHorarioVitrine(restaurante);
  const statusRelogio = statusAberturaPorRelogio(restaurante, relogio);

  const fechadoPorHorario = !vitrineFechada && statusRelogio === "fechado";
  const fechadoManual = vitrineFechada;

  const textoVitrineAbertoPadrao = "Faça seu pedido e receba em instantes.";
  const textoVitrineFechadoPadrao = "No momento estamos fechados. Veja nosso cardápio!";

  const badgeLinhaStatus = pedidosBloqueados
    ? (restaurante.texto_vitrine_fechado?.trim() || textoVitrineFechadoPadrao)
    : (restaurante.texto_vitrine_aberto?.trim() || textoVitrineAbertoPadrao);

  const rotuloStatusPrincipal = fechadoManual
    ? "Fechado"
    : fechadoPorHorario
      ? "Fechado"
      : "Aberto";

  const tituloTooltipStatus = fechadoManual
    ? "Pedidos pausados no painel do estabelecimento."
    : fechadoPorHorario
      ? "Fora do horário de funcionamento cadastrado."
      : statusRelogio === "aberto"
        ? "Dentro do horário de funcionamento cadastrado."
        : "Sem grade semanal no painel — horário exibido abaixo é informativo; pedidos seguem as regras do estabelecimento.";

  const boasVindasTexto =
    restaurante.mensagem_boas_vindas?.trim() ||
    `Bem-vindo ao cardápio de ${restaurante.nome}.`;

  const faixaAlertaTexto = pedidosBloqueados
    ? vitrineFechada
      ? mensagemFechadoCustom || badgeLinhaStatus
      : restaurante.mensagem_fora_horario?.trim() || badgeLinhaStatus
    : "";

  const zonasTx = restaurante.taxas_entrega_zonas ?? [];

  const irParaSecao = (titulo: string) => {
    const id = `sec-${slugifySecaoCardapio(titulo)}`;
    setActiveCategoriaId(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={`${shellClass} pb-28 sm:pb-32`}>
      {pedidosBloqueados && faixaAlertaTexto ? (
        <div
          role="alert"
          className="border-b border-amber-200/55 bg-amber-50/92 backdrop-blur-md supports-[backdrop-filter]:bg-amber-50/78"
        >
          <div className="mx-auto max-w-3xl px-5 py-3.5 text-center sm:px-8">
            <p className="text-[13px] font-medium leading-relaxed text-amber-950/95">{faixaAlertaTexto}</p>
          </div>
        </div>
      ) : null}

      <div
        className="relative overflow-hidden border-b border-zinc-200/45 pb-12 pt-10 sm:pb-14 sm:pt-12"
        style={{
          background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 10%, #ffffff) 0%, #fafafa 46%, #fafafa 100%)`,
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_45%_at_50%_0%,rgba(255,255,255,0.88),transparent)]"
          aria-hidden
        />
        <div className="relative mx-auto max-w-2xl px-5 text-center sm:px-8">
          <div className="mx-auto flex w-fit justify-center">
            {restaurante.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={restaurante.logo}
                alt=""
                className="h-[5.25rem] w-[5.25rem] rounded-2xl border border-zinc-200/90 bg-white object-cover shadow-sm ring-1 ring-black/[0.04] sm:h-24 sm:w-24"
              />
            ) : (
              <div
                className="flex h-[5.25rem] w-[5.25rem] items-center justify-center rounded-2xl border border-zinc-200/90 bg-white text-2xl font-semibold text-zinc-400 shadow-sm ring-1 ring-black/[0.04] sm:h-24 sm:w-24"
                style={{
                  boxShadow: `0 0 0 1px color-mix(in srgb, ${accent} 14%, transparent), 0 10px 32px -20px rgba(0,0,0,0.14)`,
                }}
              >
                <span aria-hidden>{restaurante.nome.slice(0, 1).toUpperCase()}</span>
              </div>
            )}
          </div>

          <h1 className="mt-7 text-[1.9rem] font-black tracking-[-0.03em] text-zinc-950 sm:mt-8 sm:text-[2.4rem] sm:leading-[1.06]">
            {restaurante.nome}
          </h1>

          <div className="mt-8 flex justify-center sm:mt-9" role="status" aria-live="polite">
            <div
              title={tituloTooltipStatus}
              className={[
                "inline-flex max-w-full cursor-default select-none items-center gap-2.5 rounded-full border px-5 py-2.5 text-left shadow-lg sm:gap-3 sm:px-7 sm:py-3",
                pedidosBloqueados
                  ? "border-red-800/25 bg-red-600 text-white shadow-red-600/35 ring-1 ring-white/15"
                  : "border-emerald-800/20 bg-emerald-500 text-white shadow-emerald-600/35 ring-1 ring-white/15",
              ].join(" ")}
            >
              <span className="sr-only">{tituloTooltipStatus}</span>
              <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
                {!pedidosBloqueados ? (
                  <span className="absolute inset-0 animate-ping rounded-full bg-white/50" />
                ) : (
                  <span className="absolute inset-0 animate-ping rounded-full bg-white/40" />
                )}
                <span
                  className={[
                    "relative inline-flex h-2.5 w-2.5 rounded-full ring-2 ring-white/90",
                    pedidosBloqueados ? "bg-red-200" : "bg-emerald-100",
                  ].join(" ")}
                />
              </span>
              <p className="min-w-0 text-[13px] font-semibold leading-snug tracking-tight sm:text-sm">
                <span className="text-white">{rotuloStatusPrincipal}</span>
                <span className="mx-1.5 font-light text-white/70">·</span>
                <span className="font-medium text-white/95">{badgeLinhaStatus}</span>
              </p>
            </div>
          </div>

          <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-zinc-600 sm:mt-6 sm:max-w-lg">
            {boasVindasTexto}
          </p>

          {!pedidosBloqueados ? (
            <div className="mx-auto mt-4 flex max-w-lg flex-wrap justify-center gap-2 sm:mt-5">
              {restaurante.retirada_balcao ? (
                <span className="inline-flex rounded-full border border-zinc-200/90 bg-white/75 px-3 py-1 text-[11px] font-medium tabular-nums text-zinc-600 backdrop-blur-sm">
                  Retirada
                </span>
              ) : null}
              {zonasTx.length === 1 ? (
                <span className="inline-flex rounded-full border border-zinc-200/90 bg-white/75 px-3 py-1 text-[11px] font-medium tabular-nums text-zinc-600 backdrop-blur-sm">
                  {formatBRL(zonasTx[0].valor)}
                </span>
              ) : null}
              {zonasTx.length > 1 ? (
                <span className="inline-flex rounded-full border border-zinc-200/90 bg-white/75 px-3 py-1 text-[11px] font-medium tabular-nums text-zinc-600 backdrop-blur-sm">
                  {zonasTx.length} zonas
                </span>
              ) : null}
              {zonasTx.length === 0 &&
              restaurante.taxa_entrega != null &&
              restaurante.taxa_entrega > 0 ? (
                <span className="inline-flex rounded-full border border-zinc-200/90 bg-white/75 px-3 py-1 text-[11px] font-medium tabular-nums text-zinc-600 backdrop-blur-sm">
                  {formatBRL(restaurante.taxa_entrega)}
                </span>
              ) : null}
            </div>
          ) : null}

          {textoHor ? (
            <div className="mx-auto mt-6 flex max-w-lg items-start justify-center gap-2.5 text-left sm:mt-7">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" strokeWidth={2} aria-hidden />
              <p className="text-sm leading-relaxed text-zinc-500">{textoHor}</p>
            </div>
          ) : null}
        </div>
      </div>

      {pratos.length > 0 && categorias.length > 0 ? (
        <nav
          className="sticky top-0 z-30 border-b border-zinc-200/55 bg-white/70 py-3 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-white/65 sm:py-3.5"
          aria-label="Seções do cardápio"
        >
          <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-5 [scrollbar-width:none] [-ms-overflow-style:none] sm:px-8 [&::-webkit-scrollbar]:hidden">
            {categorias.map(({ titulo }) => {
              const sid = `sec-${slugifySecaoCardapio(titulo)}`;
              const active = activeCategoriaId === sid;
              return (
                <button
                  key={titulo}
                  type="button"
                  onClick={() => irParaSecao(titulo)}
                  className={[
                    "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-all active:scale-[0.97]",
                    active
                      ? "bg-zinc-900 text-white shadow-sm ring-1 ring-black/10"
                      : "bg-zinc-100/90 text-zinc-600 hover:bg-zinc-200/90 hover:text-zinc-900",
                  ].join(" ")}
                >
                  {titulo}
                </button>
              );
            })}
          </div>
        </nav>
      ) : null}

      <main className="mx-auto max-w-6xl px-5 pb-24 pt-10 sm:px-8 sm:pb-28 sm:pt-12">
        {pratos.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-zinc-200/90 bg-white px-6 py-16 text-center text-sm leading-relaxed text-zinc-500 shadow-sm">
            {restaurante.nome} — nenhum item ativo publicado no momento.
          </p>
        ) : (
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
                      <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-zinc-200/60 bg-white shadow-[0_2px_24px_-12px_rgba(0,0,0,0.08)] transition duration-300 hover:border-zinc-200 hover:shadow-[0_12px_40px_-16px_rgba(0,0,0,0.12)]">
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
                              const bloqueado = pedidosBloqueados;
                              return (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setQty(prato.id, qty - 1)}
                                    disabled={qty < 1}
                                    title={qty < 1 ? undefined : "Remover uma unidade"}
                                    aria-label={qty < 1 ? "Nenhuma unidade no carrinho" : `Remover uma unidade de ${prato.nome}`}
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
                                    <span className="min-w-[2.25rem] select-none text-center text-sm tabular-nums text-transparent" aria-hidden>
                                      ·
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => addToCart(prato)}
                                    disabled={bloqueado}
                                    title={
                                      bloqueado
                                        ? vitrineFechada
                                          ? "Pedidos pelo cardápio estão pausados."
                                          : "Fora do horário de pedidos pelo cardápio."
                                        : undefined
                                    }
                                    aria-label={
                                      bloqueado
                                        ? "Adicionar indisponível — cardápio só para consulta"
                                        : `Adicionar ${prato.nome} ao carrinho`
                                    }
                                    className={[
                                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xl font-light leading-none text-white shadow-md transition-transform duration-150 active:scale-95",
                                      bloqueado
                                        ? "cursor-not-allowed opacity-35 shadow-none"
                                        : "hover:bg-zinc-800 hover:shadow-lg",
                                    ].join(" ")}
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
        )}
      </main>

      {cartCount > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-5 sm:bottom-6">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="pointer-events-auto flex max-w-full items-center gap-4 rounded-full border border-white/12 bg-zinc-900/90 px-6 py-3.5 text-white shadow-[0_12px_48px_-8px_rgba(0,0,0,0.45)] backdrop-blur-md transition-transform duration-150 hover:bg-zinc-900 active:scale-[0.97] supports-[backdrop-filter]:bg-zinc-900/88"
            style={{
              boxShadow: `0 16px 48px -10px color-mix(in srgb, ${accent} 28%, rgba(0,0,0,0.5))`,
            }}
            aria-label={`Sacola com ${cartCount} itens, total ${formatBRL(total)}`}
          >
            <CartIcon className="h-5 w-5 shrink-0 opacity-90" />
            <span className="font-mono text-sm font-medium tabular-nums tracking-tight text-white/95">
              {cartCount} {cartCount === 1 ? "item" : "itens"}
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums tracking-tight">
              {formatBRL(total)}
            </span>
          </button>
        </div>
      ) : null}

      {cartOpen ? (
        <div className="fixed inset-0 z-40 flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/30 backdrop-blur-md"
            aria-label="Fechar carrinho"
            onClick={() => setCartOpen(false)}
          />
          <aside
            className="relative flex h-[100dvh] w-full max-w-lg flex-col overflow-hidden rounded-l-[1.25rem] border-l border-zinc-200/80 bg-white/95 shadow-[0_0_0_1px_rgba(0,0,0,0.03)] shadow-2xl ring-1 ring-black/[0.04] backdrop-blur-xl sm:max-w-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-title"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-100/90 px-5 py-4 sm:px-6 sm:py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  Checkout
                </p>
                <h2 id="cart-title" className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
                  Seu pedido
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
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
                        <li
                          key={prato.id}
                          className="rounded-2xl border border-zinc-100 bg-zinc-50/50 p-4 shadow-sm"
                        >
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
                                onClick={() => setQty(prato.id, quantidade - 1)}
                                aria-label="Diminuir"
                              >
                                −
                              </button>
                              <span className="w-8 text-center text-sm font-semibold tabular-nums">{quantidade}</span>
                              <button
                                type="button"
                                className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-800 transition hover:bg-zinc-50 active:scale-95"
                                onClick={() => setQty(prato.id, quantidade + 1)}
                                aria-label="Aumentar"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <label className="mt-3 block text-[11px] font-medium text-zinc-500" htmlFor={`obs-${prato.id}`}>
                            Observações (opcional)
                          </label>
                          <textarea
                            id={`obs-${prato.id}`}
                            rows={2}
                            value={observacoes ?? ""}
                            onChange={(e) => setItemObservacoes(prato.id, e.target.value)}
                            placeholder="Ex.: sem cebola, ponto da carne…"
                            className="mt-1 w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-xs text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-950"
                          />
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
                        onChange={(e) => setClienteNome(e.target.value.slice(0, 120))}
                        placeholder="Nome completo"
                        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-950"
                      />
                      <input
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        value={clienteTelefoneDisplay}
                        onChange={(e) =>
                          setClienteTelefoneDisplay(formatarTelefoneWhatsappBR(e.target.value))
                        }
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
                            onClick={() => setTipoEntrega("entrega")}
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
                            onClick={() => setTipoEntrega("retirada")}
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
                                onChange={(e) => setCheckoutRua(e.target.value.slice(0, 120))}
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
                                onChange={(e) => setCheckoutNumero(e.target.value.slice(0, 12))}
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
                            <div className="space-y-2">
                              <div className="flex rounded-2xl border border-zinc-200 bg-zinc-100/80 p-1">
                                <button
                                  type="button"
                                  onClick={() => setEntregaBairroModo("digitar")}
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
                                  onClick={() => setEntregaBairroModo("lista")}
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
                                <div className="space-y-2">
                                  <label className="text-[11px] font-medium text-zinc-500" htmlFor="checkout-bairro-busca">
                                    Buscar nas regiões do restaurante
                                  </label>
                                  <input
                                    id="checkout-bairro-busca"
                                    type="text"
                                    value={bairroBuscaTexto}
                                    onChange={(e) => setBairroBuscaTexto(e.target.value.slice(0, 80))}
                                    placeholder="Ex.: Centro, Jardim…"
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:ring-2 focus:ring-zinc-950"
                                  />
                                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-zinc-100 bg-zinc-50/50 p-1">
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
                                          onClick={() => setZonaEntregaId(z.id)}
                                          className={[
                                            "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium transition",
                                            zonaEntregaId === z.id
                                              ? "bg-zinc-900 text-white"
                                              : "text-zinc-800 hover:bg-white",
                                          ].join(" ")}
                                        >
                                          <span>{z.nome}</span>
                                          <span className="tabular-nums text-xs opacity-90">{formatBRL(z.valor)}</span>
                                        </button>
                                      ))
                                    )}
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
                                <div>
                                  <label className="text-[11px] font-medium text-zinc-500" htmlFor="checkout-bairro-zona">
                                    Bairro / região
                                  </label>
                                  <select
                                    id="checkout-bairro-zona"
                                    value={zonaEntregaId ?? ""}
                                    onChange={(e) => setZonaEntregaId(e.target.value || null)}
                                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:ring-2 focus:ring-zinc-950"
                                  >
                                    <option value="">Selecione o bairro</option>
                                    {zonasEntrega.map((z) => (
                                      <option key={z.id} value={z.id}>
                                        {z.nome} — {formatBRL(z.valor)}
                                      </option>
                                    ))}
                                  </select>
                                </div>
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
                                onChange={(e) => setBairroLivreTexto(e.target.value.slice(0, 80))}
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
                              onChange={(e) => setCheckoutComplemento(e.target.value.slice(0, 160))}
                              placeholder="Apto, bloco, ponto de referência…"
                              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-950"
                            />
                          </div>
                        </div>
                      ) : (
                        <p className="rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-sm leading-relaxed text-emerald-900">
                          Retirada no balcão — sem taxa de entrega. Combine o horário pelo WhatsApp após enviar o
                          pedido.
                        </p>
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
                          onClick={() => setFormaPagamento(id)}
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
                          onChange={(e) => setTrocoParaInput(e.target.value.slice(0, 14))}
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
                    <button
                      type="button"
                      disabled
                      className="flex w-full cursor-not-allowed items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-100 py-3.5 text-sm font-semibold text-zinc-400"
                    >
                      Pedidos via WhatsApp desativados
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={checkoutSubmitting}
                      onClick={() => void handleEnviarPedidoWhatsapp()}
                      className="flex w-full items-center justify-center rounded-2xl bg-[#25D366] py-3.5 text-sm font-semibold text-white shadow-[0_12px_32px_-12px_rgba(37,211,102,0.55)] transition hover:bg-[#1ebe5a] enabled:active:scale-[0.99] disabled:cursor-wait disabled:opacity-80"
                    >
                      {checkoutSubmitting ? "Registrando pedido…" : "Enviar Pedido via WhatsApp"}
                    </button>
                  )}
                </>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
