"use client";

import { isValidSlug } from "@/lib/billing/slug";
import { createBrowserSupabaseClient } from "@/lib/supabase";
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
import { buscarEnderecoPorCep } from "@/lib/viacep";
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
import { Clock } from "lucide-react";

/** Aviso fixo no topo quando pedidos estão bloqueados (vitrine fechada ou fora do horário). */
const BANNER_FECHADO_TITULO = "Estamos fechados no momento.";
const BANNER_FECHADO_CORPO =
  "Você pode navegar, mas os pedidos via WhatsApp estão desativados.";

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

function formatCepDisplay(digitsRaw: string): string {
  const d = digitsRaw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
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
  const slug = typeof params?.slug === "string" ? params.slug : "";

  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

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
  const [checkoutCep, setCheckoutCep] = useState("");
  const [checkoutRua, setCheckoutRua] = useState("");
  const [checkoutNumero, setCheckoutNumero] = useState("");
  const [checkoutComplemento, setCheckoutComplemento] = useState("");
  const [cepBuscando, setCepBuscando] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamentoPedidoCliente>("pix");
  const [trocoParaInput, setTrocoParaInput] = useState("");
  const [checkoutErro, setCheckoutErro] = useState<string | null>(null);

  const fetchAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setAgoraTick(Date.now()), 60_000);
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
      const { data: restRow, error: restErr } = await withRetry(
        async () =>
          supabase
            .from("restaurantes")
            .select("*")
            .eq("slug", slug)
            .maybeSingle(),
        { shouldRetry: (r) => isRetryableSupabaseError(r.error) },
      );

      if (ac.signal.aborted) return;

      if (restErr) {
        setError(mensagemErroCardapioParaCliente(restErr.message));
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

      const { data: pratosData, error: pratosErr } = await withRetry(
        async () =>
          supabase
            .from("pratos")
            .select("id, restaurante_id, nome, preco, descricao, imagem, status, categoria")
            .eq("restaurante_id", rest.id)
            .eq("status", "ativo")
            .order("nome", { ascending: true }),
        { shouldRetry: (r) => isRetryableSupabaseError(r.error) },
      );

      if (ac.signal.aborted) return;

      if (pratosErr) {
        setError(mensagemErroCardapioParaCliente(pratosErr.message));
        setPratos([]);
        return;
      }

      const mapped = (pratosData ?? [])
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
  }, [slug, supabase]);

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

  const cepDigitsCheckout = useMemo(() => checkoutCep.replace(/\D/g, ""), [checkoutCep]);

  useEffect(() => {
    if (cepDigitsCheckout.length !== 8) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        setCepBuscando(true);
        const data = await buscarEnderecoPorCep(cepDigitsCheckout);
        if (cancelled) return;
        setCepBuscando(false);
        if (data?.logradouro?.trim()) {
          setCheckoutRua(data.logradouro.trim());
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      setCepBuscando(false);
    };
  }, [cepDigitsCheckout]);

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

  const handleEnviarPedidoWhatsapp = useCallback(() => {
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
      if (checkoutCep.replace(/\D/g, "").length !== 8) {
        setCheckoutErro("Informe um CEP válido (8 dígitos).");
        return;
      }
      if (!checkoutRua.trim() || !checkoutNumero.trim()) {
        setCheckoutErro("Preencha rua e número para a entrega.");
        return;
      }
      if (zonas.length > 1 && !zonaEntregaId) {
        setCheckoutErro("Selecione o bairro de entrega na lista.");
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
          : "N/A";

    const enderecoLinha =
      tipoEntrega === "retirada" ? "N/A" : `${checkoutRua.trim()}, ${checkoutNumero.trim()}`;

    const cepLinha = tipoEntrega === "retirada" ? "N/A" : formatCepDisplay(checkoutCep);

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
      cepLinha,
      refCompLinha,
      itens: cart,
      formaPagamento,
      trocoParaTexto,
      valorTrocoReais,
      subtotalItens: subtotal,
      taxaEntrega: taxaAplicada,
      totalGeral,
    });

    const href = waMeUrl(restaurante.whatsapp, msg);
    window.open(href, "_blank", "noopener,noreferrer");
  }, [
    restaurante,
    cart,
    pedidosBloqueados,
    clienteNome,
    clienteTelefoneDisplay,
    tipoEntrega,
    checkoutCep,
    checkoutRua,
    checkoutNumero,
    checkoutComplemento,
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

  const irParaSecao = (titulo: string) => {
    const id = `sec-${slugifySecaoCardapio(titulo)}`;
    setActiveCategoriaId(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={shellClass}>
      <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md">
        {pedidosBloqueados ? (
          <div
            role="alert"
            className="border-b border-amber-200/70 bg-gradient-to-b from-amber-50/98 to-amber-50/90 backdrop-blur-sm"
          >
            <div className="mx-auto max-w-6xl px-5 py-3.5 sm:px-8">
              <p className="text-center text-sm font-semibold text-amber-950 sm:text-left">
                {BANNER_FECHADO_TITULO}
              </p>
              <p className="mt-1 text-center text-xs font-normal leading-relaxed text-amber-900/90 sm:text-left sm:text-sm">
                {BANNER_FECHADO_CORPO}
              </p>
              {vitrineFechada && mensagemFechadoCustom ? (
                <p className="mt-2 border-t border-amber-200/60 pt-2 text-center text-xs font-normal text-amber-900/85 sm:text-left">
                  {mensagemFechadoCustom}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="mx-auto max-w-6xl px-5 py-8 sm:flex sm:items-center sm:justify-between sm:px-8 sm:py-10">
          <div className="flex items-start gap-5 sm:items-center">
            <div className="shrink-0">
              {restaurante.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={restaurante.logo}
                  alt=""
                  className="h-20 w-20 rounded-2xl border border-zinc-100 object-cover shadow-sm"
                />
              ) : (
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-2xl border border-zinc-100 bg-white text-xl font-semibold text-zinc-400 shadow-sm"
                  style={{
                    boxShadow: `0 0 0 1px color-mix(in srgb, ${accent} 18%, transparent), 0 8px 28px -18px rgba(0,0,0,0.12)`,
                  }}
                >
                  <span aria-hidden>{restaurante.nome.slice(0, 1).toUpperCase()}</span>
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Cardápio</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-4xl sm:leading-tight">
                {restaurante.nome}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-500">
                {pedidosBloqueados ? (
                  <span className="text-zinc-600">
                    Explore o menu abaixo. Os pedidos pelo WhatsApp ficam indisponíveis até o restaurante reabrir ou
                    retornar ao horário de atendimento.
                  </span>
                ) : (
                  <>
                    Monte seu pedido com calma; finalize no carrinho e envie pelo WhatsApp.
                    {(() => {
                  const zonasTx = restaurante.taxas_entrega_zonas ?? [];
                  if (restaurante.retirada_balcao) {
                    return (
                      <>
                        {" "}
                        <span className="font-medium text-zinc-800">Retirada no balcão disponível.</span>
                      </>
                    );
                  }
                  if (zonasTx.length === 1) {
                    return (
                      <>
                        {" "}
                        <span className="font-medium text-zinc-800">
                          Taxa de entrega: {formatBRL(zonasTx[0].valor)}
                        </span>
                        .
                      </>
                    );
                  }
                  if (zonasTx.length > 1) {
                    return (
                      <>
                        {" "}
                        <span className="font-medium text-zinc-800">
                          Taxa conforme a região — escolha no carrinho.
                        </span>
                      </>
                    );
                  }
                  if (restaurante.taxa_entrega != null && restaurante.taxa_entrega > 0) {
                    return (
                      <>
                        {" "}
                        <span className="font-medium text-zinc-800">
                          Taxa de entrega: {formatBRL(restaurante.taxa_entrega)}
                        </span>
                        .
                      </>
                    );
                  }
                  return null;
                })()}
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {pratos.length > 0 && categorias.length > 0 ? (
          <div className="border-t border-zinc-100/90">
            <nav
              className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-5 py-3 [scrollbar-width:none] [-ms-overflow-style:none] sm:px-8 sm:py-3.5 [&::-webkit-scrollbar]:hidden"
              aria-label="Seções do cardápio"
            >
              {categorias.map(({ titulo }) => {
                const sid = `sec-${slugifySecaoCardapio(titulo)}`;
                const active = activeCategoriaId === sid;
                return (
                  <button
                    key={titulo}
                    type="button"
                    onClick={() => irParaSecao(titulo)}
                    className={[
                      "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-all",
                      active
                        ? "bg-zinc-900 text-white shadow-sm"
                        : "bg-zinc-100/80 text-zinc-600 hover:bg-zinc-200/80 hover:text-zinc-900",
                    ].join(" ")}
                  >
                    {titulo}
                  </button>
                );
              })}
            </nav>
          </div>
        ) : null}
      </header>

      {textoHor || restaurante.funcionamento_semana ? (
        <div className="border-b border-zinc-100 bg-white/90">
          <div className="mx-auto flex max-w-6xl gap-4 px-5 py-4 sm:px-8 sm:py-5">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-zinc-100 bg-zinc-50 text-zinc-600"
              style={{ color: accent }}
              aria-hidden
            >
              <Clock className="h-5 w-5" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Horário de funcionamento
                </p>
                {statusRelogio === "aberto" ? (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200/70">
                    Aberto agora
                  </span>
                ) : statusRelogio === "fechado" ? (
                  <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-700 ring-1 ring-zinc-200/80">
                    Fechado agora
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm font-medium leading-relaxed text-zinc-900 sm:text-base">
                {textoHor ? (
                  textoHor
                ) : (
                  <span className="font-normal text-zinc-500">
                    Não informado neste cardápio. Se precisar de urgência, procure o restaurante pelos
                    canais habituais.
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <main className="mx-auto max-w-6xl px-5 pb-32 pt-10 sm:px-8 sm:pb-36 sm:pt-12">
        {pratos.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-zinc-200 bg-white px-6 py-16 text-center text-sm text-zinc-500 shadow-sm">
            Este restaurante ainda não publicou itens ativos no cardápio.
          </p>
        ) : (
          <div className="space-y-16 sm:space-y-20">
            {categorias.map(({ titulo, lista }) => {
              const secId = `sec-${slugifySecaoCardapio(titulo)}`;
              return (
              <section key={titulo} id={secId} aria-labelledby={`cat-${secId}`} className="scroll-mt-44 sm:scroll-mt-40">
                <div className="mb-8 flex items-baseline justify-between gap-4 border-b border-zinc-100 pb-4">
                  <h2
                    id={`cat-${secId}`}
                    className="text-xs font-semibold uppercase tracking-wider text-zinc-500"
                  >
                    {titulo}
                  </h2>
                  <span className="text-[11px] font-medium tabular-nums text-zinc-400">{lista.length}</span>
                </div>
                <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2 lg:gap-8">
                  {lista.map((prato) => (
                    <li key={prato.id}>
                      <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-zinc-100 bg-white shadow-sm transition duration-300 hover:shadow-md">
                        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-t-2xl bg-zinc-100">
                          {prato.imagem ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={prato.imagem}
                              alt=""
                              className="h-full w-full rounded-t-2xl object-cover transition duration-700 ease-out group-hover:scale-[1.02]"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-zinc-300">
                              <span className="text-4xl font-extralight" aria-hidden>
                                —
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col gap-3 p-6 sm:p-7">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <h3 className="text-lg font-semibold tracking-tight text-zinc-900 sm:text-xl">
                              {prato.nome}
                            </h3>
                            <p className="shrink-0 text-base font-semibold tabular-nums tracking-tight text-zinc-900">
                              {formatBRL(prato.preco)}
                            </p>
                          </div>
                          {prato.descricao ? (
                            <p className="line-clamp-3 text-sm leading-relaxed text-zinc-500">{prato.descricao}</p>
                          ) : (
                            <p className="text-sm italic text-zinc-400">Sem descrição</p>
                          )}
                          <div className="mt-auto flex justify-end pt-2">
                            <button
                              type="button"
                              onClick={() => addToCart(prato)}
                              disabled={pedidosBloqueados}
                              title={
                                pedidosBloqueados
                                  ? vitrineFechada
                                    ? "Pedidos pelo cardápio estão pausados. Consulte o horário acima."
                                    : "Fora do horário de pedidos pelo cardápio."
                                  : undefined
                              }
                              aria-label={
                                pedidosBloqueados
                                  ? "Adicionar indisponível — cardápio só para consulta"
                                  : `Adicionar ${prato.nome} ao carrinho`
                              }
                              className={[
                                "flex h-11 w-11 items-center justify-center rounded-full bg-zinc-900 text-xl font-light leading-none text-white shadow-sm transition active:scale-[0.97]",
                                pedidosBloqueados
                                  ? "cursor-not-allowed opacity-35 shadow-none"
                                  : "hover:bg-zinc-800",
                              ].join(" ")}
                            >
                              <span aria-hidden>+</span>
                            </button>
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
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-5 sm:bottom-8">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="pointer-events-auto flex max-w-full items-center gap-4 rounded-full border border-white/10 bg-[#1d1d1f] px-5 py-3.5 text-white shadow-[0_20px_50px_-12px_rgba(0,0,0,0.55)] transition hover:bg-black active:scale-[0.99]"
            style={{
              boxShadow: `0 20px 50px -12px color-mix(in srgb, ${accent} 35%, rgba(0,0,0,0.55))`,
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
                          <div>
                            <label className="text-[11px] font-medium text-zinc-500" htmlFor="checkout-cep">
                              CEP
                            </label>
                            <div className="relative mt-1">
                              <input
                                id="checkout-cep"
                                type="text"
                                inputMode="numeric"
                                value={formatCepDisplay(checkoutCep)}
                                onChange={(e) => setCheckoutCep(e.target.value.replace(/\D/g, "").slice(0, 8))}
                                placeholder="00000-000"
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50/40 px-4 py-3 pr-12 text-sm text-zinc-900 outline-none transition focus:bg-white focus:ring-2 focus:ring-zinc-950"
                              />
                              {cepBuscando ? (
                                <span className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
                              ) : null}
                            </div>
                            <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                              Endereço preenchido automaticamente pelo CEP quando disponível.
                            </p>
                          </div>
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
                            <div>
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
                            <div>
                              <label className="text-[11px] font-medium text-zinc-500" htmlFor="checkout-bairro-zona">
                                Bairro
                              </label>
                              {(restaurante.taxas_entrega_zonas ?? []).length >= 1 ? (
                                <select
                                  id="checkout-bairro-zona"
                                  value={zonaEntregaId ?? ""}
                                  onChange={(e) => setZonaEntregaId(e.target.value || null)}
                                  disabled={(restaurante.taxas_entrega_zonas ?? []).length === 1}
                                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:ring-2 focus:ring-zinc-950 disabled:cursor-default disabled:opacity-90"
                                >
                                  {(restaurante.taxas_entrega_zonas ?? []).length > 1 ? (
                                    <option value="">Selecione o bairro</option>
                                  ) : null}
                                  {(restaurante.taxas_entrega_zonas ?? []).map((z) => (
                                    <option key={z.id} value={z.id}>
                                      {z.nome} — {formatBRL(z.valor)}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <p className="mt-2 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                                  Taxa conforme cadastro do restaurante (sem bairros cadastrados).
                                </p>
                              )}
                            </div>
                          </div>
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
                      onClick={() => handleEnviarPedidoWhatsapp()}
                      className="flex w-full items-center justify-center rounded-2xl bg-[#25D366] py-3.5 text-sm font-semibold text-white shadow-[0_12px_32px_-12px_rgba(37,211,102,0.55)] transition hover:bg-[#1ebe5a] active:scale-[0.99]"
                    >
                      Enviar Pedido via WhatsApp
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
