"use client";

import type { CarrinhoItem, Prato, Restaurante, EntregaModo } from "@/types";
import {
  taxaEntregaParaPedido,
  type TipoEntregaPedido,
} from "@/lib/restaurante/pedido-texto-whatsapp";
import {
  montarTextoPedidoResumoParaApi,
  montarTextoPedidoWhatsAppFormatado,
  type FormaPagamentoPedidoCliente,
} from "@/lib/restaurante/pedido-whatsapp-formatado";
import { formatarTelefoneWhatsappBR, digitosTelefoneBR } from "@/lib/restaurante/br-telefone-mascara";
import { parsePrecoBrasileiro } from "@/lib/restaurante/preco-input";
import {
  statusAberturaPorRelogio,
  vitrineHorarioExibicao,
} from "@/lib/restaurante/horario-vitrine";
import { parseFuncionamentoSemana, proximaAberturaTextoPt } from "@/lib/restaurante/funcionamento-semana";
import { parseTaxasEntregaZonas } from "@/lib/restaurante/taxas-entrega-zonas";
import {
  ordenarSecoesCardapio,
  parseCardapioCategorias,
  slugifySecaoCardapio,
} from "@/lib/restaurante/cardapio-categorias";
import { formatBRL } from "@/lib/restaurante/format-brl";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock, UtensilsCrossed } from "lucide-react";
import { isValidSlug } from "@/lib/billing/slug";
import { normalizeCorTema } from "@/lib/restaurante/cor-tema";
import { expandLatin1UserText } from "@/lib/restaurante/json-latin1-wire";
import { fetchPublicCardapioDeduped } from "@/lib/restaurante/cardapio-public-load";
import { registrarPedidoVitrineNaApi } from "@/lib/restaurante/registrar-pedido-vitrine-client";
import { buildWhatsappSendHref } from "@/lib/restaurante/whatsapp-href";
import { navigatePreparedTabOrOpen, prepareNewTabForLaterNavigation } from "@/lib/restaurante/open-url-nova-guia";
import { isRetryableSupabaseError, withRetry } from "@/lib/with-retry";
import { devClientError } from "@/lib/logging/dev-client-log";
import {
  trackCheckoutIniciado,
  trackItemAdicionado,
  trackPedidoConcluido,
  trackVitrineVisualizada,
} from "@/lib/analytics/tracker";

const CartDrawer = dynamic(() => import("@/components/vitrine/CartDrawer"), { ssr: false });

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

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function digitsOnly(input: string) {
  return input.replace(/\D/g, "");
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
    cor_tema: normalizeCorTema(row.cor_tema ?? ""),
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
      width={640}
      height={480}
      sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
      loading="lazy"
      decoding="async"
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
  const [modalCheckoutFechadoOpen, setModalCheckoutFechadoOpen] = useState(false);

  const fetchAbort = useRef<AbortController | null>(null);
  /** Evita duplo envio (duplo clique) antes e durante o registro do pedido. */
  const checkoutLockRef = useRef(false);
  /** Mesma chave em retries de rede / confirmação — idempotência no servidor. */
  const pedidoIdempotencyKeyRef = useRef<string | null>(null);
  const vitrineViewTrackedRef = useRef<string | null>(null);

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
            const bodyRaw = await fetchPublicCardapioDeduped(slug, ac.signal);
            return {
              data: {
                restaurante: (bodyRaw.restaurante ?? null) as RestauranteRow | null,
                pratos: Array.isArray(bodyRaw.pratos) ? bodyRaw.pratos : [],
              },
              error: null as { message: string } | null,
            };
          } catch (e) {
            if (e instanceof DOMException && e.name === "AbortError") {
              return {
                data: null,
                error: { message: "aborted" },
              };
            }
            return {
              data: null,
              error: { message: e instanceof Error ? e.message : "Falha de rede." },
            };
          }
        },
        { shouldRetry: (r) => isRetryableSupabaseError(r.error) },
      );

      if (ac.signal.aborted) return;

      if (result.error?.message === "aborted") return;

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
    if (!slug || loading || !restaurante?.id) return;
    const key = `${slug}:${restaurante.id}`;
    if (vitrineViewTrackedRef.current === key) return;
    vitrineViewTrackedRef.current = key;
    void trackVitrineVisualizada(slug);
  }, [slug, loading, restaurante?.id]);

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
      const oWire = o ? expandLatin1UserText(o.slice(0, 400)) : undefined;
      return oWire
        ? { i: prato.id, q: quantidade, o: oWire }
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
      document.title = expandLatin1UserText(`${restaurante.nome} - Cardápio`);
    } else if (slug) {
      document.title = expandLatin1UserText(`${formatSlugToDisplayName(slug)} - Cardápio`);
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

  const proximaAberturaLinha = useMemo(() => {
    if (!restaurante) return null;
    const manual = restaurante.vitrine_fechada === true;
    const sr = statusAberturaPorRelogio(restaurante, relogio);
    if (manual || sr !== "fechado") return null;
    const f = restaurante.funcionamento_semana;
    if (!f) return null;
    return proximaAberturaTextoPt(f, relogio);
  }, [restaurante, relogio]);

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

  useEffect(() => {
    if (loading || !restaurante || pratos.length === 0) return;
    const articles = document.querySelectorAll<HTMLElement>("main [data-reveal-scroll]");
    if (!articles.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) en.target.classList.add("reveal-scroll--in");
        });
      },
      { threshold: 0.07, rootMargin: "0px 0px -8% 0px" },
    );
    articles.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [loading, restaurante?.id, pratos.length, categorias.length]);

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

  const accent = restaurante ? normalizeCorTema(restaurante.cor_tema) : "#1d1d1f";

  const addToCart = (prato: Prato) => {
    void trackItemAdicionado(slug, prato.id);
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
    if (quantidade < 1) {
      setCart((prev) => prev.filter((x) => x.prato.id !== pratoId));
      return;
    }
    setCart((prev) =>
      prev.map((x) => (x.prato.id === pratoId ? { ...x, quantidade } : x)),
    );
  };

  const handleEnviarPedidoWhatsapp = useCallback(async () => {
    if (checkoutLockRef.current || checkoutSubmitting) return;
    checkoutLockRef.current = true;
    setCheckoutSubmitting(true);
    setCheckoutErro(null);
    try {
      if (!restaurante || cart.length === 0) {
        if (cart.length === 0) setCheckoutErro("Adicione itens ao carrinho antes de enviar.");
        return;
      }
      if (pedidosBloqueados) {
        setCheckoutErro(null);
        setModalCheckoutFechadoOpen(true);
        return;
      }
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
          setCheckoutErro(
            "Selecione o bairro (busca ou lista) conforme as regiões atendidas pelo restaurante.",
          );
          return;
        }
        if (zonas.length === 0 && bairroLivreTexto.trim().length < 2) {
          setCheckoutErro("Informe o bairro ou região da entrega.");
          return;
        }
      }

      const liveById = new Map(pratos.map((p) => [p.id, p]));
      const cartSynced: CarrinhoItem[] = [];
      for (const line of cart) {
        const live = liveById.get(line.prato.id);
        if (!live) {
          setCheckoutErro(
            "Um item do carrinho deixou de estar disponível. Atualize a página e monte o pedido de novo.",
          );
          return;
        }
        if (Math.round(live.preco * 100) !== Math.round(line.prato.preco * 100)) {
          setCheckoutErro(
            "Os preços do cardápio foram atualizados. Atualize a página para sincronizar o carrinho e confirme o pedido.",
          );
          return;
        }
        cartSynced.push({ ...line, prato: live });
      }

      const taxaBase = taxaEntregaParaPedido(restaurante, zonaEntregaId, { tipo: tipoEntrega }).valor;
      const taxaAplicada = cartSynced.length > 0 ? taxaBase : 0;
      const subtotal = cartSynced.reduce((acc, { prato, quantidade }) => acc + prato.preco * quantidade, 0);
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

      const payloadPedido = {
        nomeCliente: nomeOk,
        telefoneCliente: formatarTelefoneWhatsappBR(clienteTelefoneDisplay),
        tipoEntrega,
        enderecoLinha,
        bairroLinha: bairroNome,
        refCompLinha,
        itens: cartSynced,
        formaPagamento,
        trocoParaTexto,
        valorTrocoReais,
        subtotalItens: subtotal,
        taxaEntrega: taxaAplicada,
        totalGeral,
      } as const;

      /** Só Latin-1: nunca enviar o modelo com bullet U+2022 no JSON da API. */
      const observacoesApi = montarTextoPedidoResumoParaApi(payloadPedido);

      const linhasApi = cartSynced.map(({ prato, quantidade }) => ({
        pratoId: prato.id,
        quantidade,
      }));
      const zonaApi =
        tipoEntrega === "retirada"
          ? null
          : zonas.length > 1
            ? zonaEntregaId
            : zonas.length === 1
              ? zonas[0].id
              : null;

      const waTab = prepareNewTabForLaterNavigation();
      try {
        /** Registro via XMLHttpRequest + corpo UTF-8 (evita ByteString do `fetch` em alguns runtimes). */
        const { status, json } = await registrarPedidoVitrineNaApi(
          "/api/pedidos/vitrine",
          {
            restauranteId: restaurante.id,
            cliente: nomeOk,
            telefone: formatarTelefoneWhatsappBR(clienteTelefoneDisplay),
            formaPagamento,
            linhas: linhasApi,
            zonaEntregaId: zonaApi,
            observacoes: observacoesApi,
            tipoEntrega,
          },
          {
            idempotencyKey:
              pedidoIdempotencyKeyRef.current ??
              (pedidoIdempotencyKeyRef.current =
                typeof crypto !== "undefined" && "randomUUID" in crypto
                  ? crypto.randomUUID()
                  : `ped-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`),
          },
        );
        if (!json.ok || status < 200 || status >= 300) {
          try {
            waTab?.close();
          } catch {
            /* ignore */
          }
          setCheckoutErro(
            json.error ??
              (status === 503
                ? "Não foi possível registrar o pedido no servidor. Tente enviar pelo WhatsApp manualmente."
                : "Não foi possível registrar o pedido. Tente novamente."),
          );
          return;
        }
        pedidoIdempotencyKeyRef.current = null;
        void trackPedidoConcluido(slug, json.id ?? null);
        const textoWhatsAppComBullets = montarTextoPedidoWhatsAppFormatado(payloadPedido);
        navigatePreparedTabOrOpen(
          waTab,
          buildWhatsappSendHref(restaurante.whatsapp, textoWhatsAppComBullets),
        );
      } catch (e) {
        try {
          waTab?.close();
        } catch {
          /* ignore */
        }
        devClientError("[checkout] falha ao registrar pedido:", e);
        setCheckoutErro("Falha de rede ao registrar o pedido. Verifique sua conexão e tente de novo.");
      }
    } finally {
      setCheckoutSubmitting(false);
      checkoutLockRef.current = false;
    }
  }, [
    slug,
    restaurante,
    cart,
    pratos,
    pedidosBloqueados,
    checkoutSubmitting,
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

  const horarioVitrine = vitrineHorarioExibicao(restaurante);
  const statusRelogio = statusAberturaPorRelogio(restaurante, relogio);

  const fechadoPorHorario = !vitrineFechada && statusRelogio === "fechado";
  const fechadoManual = vitrineFechada;

  const textoVitrineAbertoPadrao = "Faça seu pedido e receba em instantes.";
  /** Mensagem curta quando a vitrine está pausada manualmente (complemento ao banner). */
  const textoVitrineFechadoPadrao = "No momento não enviamos pelo cardápio — você ainda pode explorar o menu.";
  /** Linha curta ao lado de “Fechado” no badge quando não há texto customizado em texto_vitrine_fechado. */
  const textoVitrineFechadoBadgePadraoManual = "Pedidos pausados pelo estabelecimento.";
  const textoVitrineFechadoBadgePadraoHorario = "Fora do horário de atendimento.";

  const pillVitrineFechadoCustom = restaurante.texto_vitrine_fechado?.trim() ?? "";

  const badgeLinhaStatus = pedidosBloqueados
    ? pillVitrineFechadoCustom ||
      (fechadoManual ? textoVitrineFechadoBadgePadraoManual : textoVitrineFechadoBadgePadraoHorario)
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
    `👋 Olá! Seja muito bem-vindo ao ${restaurante.nome}. Escolha seus favoritos abaixo!`;

  const bannerLinhaPrincipal = fechadoManual
    ? pillVitrineFechadoCustom || "Pedidos pelo cardápio pausados no momento"
    : [
        "Fechado no momento",
        proximaAberturaLinha,
        pillVitrineFechadoCustom || null,
      ]
        .filter((x): x is string => Boolean(x && x.trim()))
        .join(" · ");

  const bannerLinhaSecundaria = fechadoManual
    ? mensagemFechadoCustom || textoVitrineFechadoPadrao
    : restaurante.mensagem_fora_horario?.trim() ||
      "Explore o cardápio à vontade — você pode montar seu carrinho e finalizar pelo WhatsApp quando abrirmos.";

  const zonasTx = restaurante.taxas_entrega_zonas ?? [];

  const irParaSecao = (titulo: string) => {
    const id = `sec-${slugifySecaoCardapio(titulo)}`;
    setActiveCategoriaId(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={`${shellClass} pb-28 sm:pb-32`}>
      {pedidosBloqueados ? (
        <div
          role="status"
          aria-live="polite"
          className="border-b border-amber-200/40 bg-gradient-to-b from-amber-50/98 via-amber-50/92 to-amber-50/85 shadow-[0_1px_0_rgba(251,191,36,0.12)] backdrop-blur-md supports-[backdrop-filter]:from-amber-50/90"
        >
          <div className="mx-auto flex max-w-3xl items-start gap-2.5 px-4 py-2.5 sm:items-center sm:gap-3 sm:px-6 sm:py-2.5">
            <Clock
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-700/85 sm:mt-0 sm:h-[1.05rem] sm:w-[1.05rem]"
              strokeWidth={2}
              aria-hidden
            />
            <div className="min-w-0 flex-1 text-left">
              <p className="text-[12.5px] font-semibold leading-snug text-amber-950/95 sm:text-[13px]">
                {bannerLinhaPrincipal}
              </p>
              {bannerLinhaSecundaria ? (
                <p className="mt-0.5 text-[11.5px] font-medium leading-relaxed text-amber-900/75 sm:text-xs">
                  {bannerLinhaSecundaria}
                </p>
              ) : null}
            </div>
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
          <div className="mx-auto flex h-24 w-24 shrink-0 justify-center">
            {restaurante.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={restaurante.logo}
                alt=""
                width={96}
                height={96}
                loading="eager"
                decoding="async"
                className="h-full w-full rounded-2xl border border-zinc-200/90 bg-white object-cover shadow-sm ring-1 ring-black/[0.04]"
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center rounded-2xl border border-zinc-200/90 bg-white text-2xl font-semibold text-zinc-400 shadow-sm ring-1 ring-black/[0.04]"
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
                "inline-flex max-w-full cursor-default select-none items-center gap-2.5 rounded-full border px-5 py-2.5 text-left shadow-md sm:gap-3 sm:px-7 sm:py-3",
                pedidosBloqueados
                  ? fechadoPorHorario
                    ? "border-amber-200/90 bg-gradient-to-br from-amber-50 to-orange-50/90 text-amber-950 shadow-amber-900/10 ring-1 ring-amber-100/80"
                    : "border-zinc-300/80 bg-zinc-800 text-white shadow-zinc-900/25 ring-1 ring-white/10"
                  : "border-emerald-800/20 bg-emerald-500 text-white shadow-emerald-600/35 ring-1 ring-white/15",
              ].join(" ")}
            >
              <span className="sr-only">{tituloTooltipStatus}</span>
              <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
                {!pedidosBloqueados ? (
                  <span className="absolute inset-0 animate-ping rounded-full bg-white/50" />
                ) : fechadoPorHorario ? (
                  <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/35" />
                ) : (
                  <span className="absolute inset-0 animate-ping rounded-full bg-white/35" />
                )}
                <span
                  className={[
                    "relative inline-flex h-2.5 w-2.5 rounded-full ring-2",
                    pedidosBloqueados
                      ? fechadoPorHorario
                        ? "bg-amber-400 ring-amber-100"
                        : "bg-amber-100 ring-white/90"
                      : "bg-emerald-100 ring-white/90",
                  ].join(" ")}
                />
              </span>
              <p
                className={[
                  "min-w-0 text-[13px] font-semibold leading-snug tracking-tight sm:text-sm",
                  pedidosBloqueados && fechadoPorHorario ? "text-amber-950" : "",
                ].join(" ")}
              >
                <span
                  className={
                    pedidosBloqueados && fechadoPorHorario ? "text-amber-950" : "text-white"
                  }
                >
                  {rotuloStatusPrincipal}
                </span>
                <span
                  className={[
                    "mx-1.5 font-light",
                    pedidosBloqueados && fechadoPorHorario ? "text-amber-800/50" : "text-white/70",
                  ].join(" ")}
                >
                  ·
                </span>
                <span
                  className={[
                    "font-medium",
                    pedidosBloqueados && fechadoPorHorario ? "text-amber-900/95" : "text-white/95",
                  ].join(" ")}
                >
                  {badgeLinhaStatus}
                </span>
              </p>
            </div>
          </div>

          <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-zinc-600 sm:mt-6 sm:max-w-lg">
            {boasVindasTexto}
          </p>

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

          {horarioVitrine ? (
            <div className="mx-auto mt-5 max-w-md sm:mt-6">
              {horarioVitrine.modo === "blocos" ? (
                <div className="rounded-2xl border border-zinc-200/50 bg-white/60 px-4 py-3.5 shadow-[0_1px_0_rgba(0,0,0,0.04)] backdrop-blur-sm sm:px-5">
                  <ul className="space-y-2">
                    {horarioVitrine.blocos.map((b, i) => (
                      <li
                        key={`${b.labelDias}-${i}`}
                        className="flex items-baseline justify-between gap-4 text-[13px] leading-snug"
                      >
                        <span className="min-w-0 shrink text-zinc-500">{b.labelDias}</span>
                        <span className="shrink-0 text-right font-medium tabular-nums text-zinc-800">
                          {b.detalhe}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-2xl border border-zinc-200/50 bg-white/60 px-4 py-3.5 text-center shadow-[0_1px_0_rgba(0,0,0,0.04)] backdrop-blur-sm sm:px-5">
                  <p className="text-[13px] leading-relaxed text-zinc-500">{horarioVitrine.texto}</p>
                </div>
              )}
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
        )}
      </main>

      {cartCount > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-5 sm:bottom-6">
          <button
            type="button"
            onClick={() => {
              void trackCheckoutIniciado(slug);
              setCartOpen(true);
            }}
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

      {modalCheckoutFechadoOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px] transition-opacity"
            aria-label="Fechar aviso"
            onClick={() => setModalCheckoutFechadoOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-fechado-titulo"
            className="relative w-full max-w-md rounded-[1.35rem] border border-zinc-200/90 bg-white p-6 shadow-[0_24px_64px_-20px_rgba(0,0,0,0.38)] sm:p-7"
          >
            <p
              id="modal-fechado-titulo"
              className="text-lg font-semibold tracking-tight text-zinc-900 sm:text-xl"
            >
              {fechadoManual ? "Pedidos em pausa" : "Quase lá!"}
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-zinc-600">
              {fechadoManual
                ? "No momento não estamos recebendo pelo cardápio, mas você pode deixar tudo separado no carrinho — quando voltarmos, é só finalizar por aqui."
                : "Gostou do prato? No momento estamos fechados, mas você já pode deixar seu carrinho montado para quando abrirmos!"}
            </p>
            {proximaAberturaLinha ? (
              <p className="mt-4 rounded-2xl border border-amber-100/90 bg-amber-50/80 px-4 py-3 text-sm font-medium text-amber-950/95">
                {proximaAberturaLinha}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setModalCheckoutFechadoOpen(false)}
              className="mt-6 w-full rounded-2xl bg-zinc-900 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 active:scale-[0.99]"
            >
              Entendi, continuar montando
            </button>
          </div>
        </div>
      ) : null}

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        restaurante={restaurante}
        cart={cart}
        pedidosBloqueados={pedidosBloqueados}
        tipoEntrega={tipoEntrega}
        onTipoEntregaChange={setTipoEntrega}
        zonaEntregaId={zonaEntregaId}
        onZonaEntregaIdChange={setZonaEntregaId}
        zonasEntrega={zonasEntrega}
        zonasFiltradasPorBusca={zonasFiltradasPorBusca}
        entregaBairroModo={entregaBairroModo}
        onEntregaBairroModoChange={setEntregaBairroModo}
        bairroBuscaTexto={bairroBuscaTexto}
        onBairroBuscaTextoChange={setBairroBuscaTexto}
        bairroLivreTexto={bairroLivreTexto}
        onBairroLivreTextoChange={setBairroLivreTexto}
        clienteNome={clienteNome}
        onClienteNomeChange={setClienteNome}
        clienteTelefoneDisplay={clienteTelefoneDisplay}
        onClienteTelefoneDisplayChange={setClienteTelefoneDisplay}
        checkoutRua={checkoutRua}
        onCheckoutRuaChange={setCheckoutRua}
        checkoutNumero={checkoutNumero}
        onCheckoutNumeroChange={setCheckoutNumero}
        checkoutComplemento={checkoutComplemento}
        onCheckoutComplementoChange={setCheckoutComplemento}
        formaPagamento={formaPagamento}
        onFormaPagamentoChange={setFormaPagamento}
        trocoParaInput={trocoParaInput}
        onTrocoParaInputChange={setTrocoParaInput}
        trocoParaValor={trocoParaValor}
        subtotalCarrinho={subtotalCarrinho}
        taxaCarrinho={taxaCarrinho}
        total={total}
        checkoutErro={checkoutErro}
        checkoutSubmitting={checkoutSubmitting}
        onEnviarPedido={handleEnviarPedidoWhatsapp}
        onSetQty={setQty}
        onSetItemObservacoes={setItemObservacoes}
      />
    </div>
  );
}
