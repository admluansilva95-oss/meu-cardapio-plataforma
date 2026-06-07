"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EntregaModo, Prato, PratoStatus, Restaurante } from "../../types";
import { PedidosDashboardSkeleton } from "@/components/admin/PedidosDashboardSkeleton";
import { PedidosEmptyState } from "@/components/admin/PedidosEmptyState";
import { PedidosKpiBar } from "@/components/admin/PedidosKpiBar";
import { PhoneInput } from "@/components/PhoneInput";
import { isValidSlug } from "@/lib/billing/slug";
import { playNewOrderChime } from "@/lib/admin/play-new-order-chime";
import { computePedidoKpis } from "@/lib/admin/pedido-kpis";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { getPublicAppUrl } from "@/lib/site-url";
import { isRetryableSupabaseError, withRetry } from "@/lib/with-retry";
import { mensagemErroSupabasePainel } from "@/lib/supabase/mensagem-erro";
import {
  normalizarPrecoCampoAoSair,
  parsePrecoBrasileiro,
  sanitizePrecoBrInput,
} from "@/lib/restaurante/preco-input";
import { normalizeCorTema } from "@/lib/restaurante/cor-tema";
import {
  criarFuncionamentoSemanaVazio,
  formatFuncionamentoResumo,
  parseFuncionamentoSemana,
  validarFuncionamentoSemana,
  type FuncionamentoSemana,
} from "@/lib/restaurante/funcionamento-semana";
import {
  parseTaxasEntregaZonas,
  validarTaxasZonas,
  zonasFromLegacyTaxa,
  type TaxaEntregaZona,
} from "@/lib/restaurante/taxas-entrega-zonas";
import {
  categoriasDistintasDosPratos,
  parseCardapioCategorias,
  validarCardapioCategorias,
} from "@/lib/restaurante/cardapio-categorias";
import { EntregaComercialSection, taxaFixaInicialDeRestaurante, taxaFixaParaPersistir } from "@/components/admin/EntregaComercialSection";
import { CategoriaPratoField } from "@/components/admin/CategoriaPratoField";
import { BookOpen, ClipboardList, Palette, type LucideIcon } from "lucide-react";
import { FuncionamentoSemanalForm } from "@/components/admin/FuncionamentoSemanalForm";
import { RestauranteLogoUploadField } from "@/components/admin/RestauranteLogoUploadField";
import { IosToggle } from "@/components/ui/IosToggle";

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

type AdminTab = "pedidos" | "cardapio" | "configuracoes";
type KanbanCol = "recebidos" | "cozinha" | "pronto" | "entregue";
type FormaPagamento = "Pix" | "Cartão" | "Dinheiro";

interface Pedido {
  id: string;
  cliente: string;
  telefone: string;
  itens: string[];
  total: number;
  pagamento: FormaPagamento;
  motoboy: string;
  observacoes: string;
  coluna: KanbanCol;
  /** ISO 8601 — usado em KPIs e ordenação. */
  criado_em: string;
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPedidoId(id: string) {
  if (id.length <= 12) return id;
  return `PED-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeItens(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

function isKanbanCol(v: string): v is KanbanCol {
  return v === "recebidos" || v === "cozinha" || v === "pronto" || v === "entregue";
}

function isFormaPagamento(v: string): v is FormaPagamento {
  return v === "Pix" || v === "Cartão" || v === "Dinheiro";
}

function mapPedidoRow(row: {
  id: string;
  cliente: string;
  telefone: string;
  total: string | number;
  pagamento: string;
  coluna: string;
  observacoes: string | null;
  itens: unknown;
  motoboy: string | null;
  criado_em?: string | null;
}): Pedido | null {
  if (!isKanbanCol(row.coluna)) return null;
  if (!isFormaPagamento(row.pagamento)) return null;
  const criado =
    typeof row.criado_em === "string" && row.criado_em.length > 0
      ? row.criado_em
      : new Date(0).toISOString();
  return {
    id: row.id,
    cliente: row.cliente,
    telefone: row.telefone,
    itens: normalizeItens(row.itens),
    total: toNumber(row.total),
    pagamento: row.pagamento,
    motoboy: row.motoboy?.trim() ?? "",
    observacoes: row.observacoes?.trim() ?? "",
    coluna: row.coluna,
    criado_em: criado,
  };
}

const BUCKET_IMAGENS_PRATOS = "imagens-pratos";
const BUCKET_RESTAURANT_LOGOS = "restaurant-logos";

function extensaoImagemSegura(file: File): string {
  const mime = file.type.toLowerCase();
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && ["jpg", "jpeg", "png", "webp", "gif"].includes(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }
  return "jpg";
}

/** Extrai o path dentro do bucket a partir da URL pública do Supabase Storage. */
function caminhoStorageDeUrlPublica(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET_IMAGENS_PRATOS}/`;
  const i = publicUrl.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(publicUrl.slice(i + marker.length));
}

async function enviarImagemAoBucketImagensPratos(
  supabase: ReturnType<typeof createBrowserSupabaseClient>,
  restauranteId: string,
  file: File,
): Promise<string> {
  const ext = extensaoImagemSegura(file);
  const objectPath = `${restauranteId}/${crypto.randomUUID()}.${ext}`;
  const contentType =
    file.type && file.type.startsWith("image/")
      ? file.type
      : `image/${ext === "jpg" ? "jpeg" : ext}`;
  const { error } = await supabase.storage
    .from(BUCKET_IMAGENS_PRATOS)
    .upload(objectPath, file, { contentType, cacheControl: "3600", upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET_IMAGENS_PRATOS).getPublicUrl(objectPath);
  return data.publicUrl;
}

function caminhoStorageLogoRestaurante(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET_RESTAURANT_LOGOS}/`;
  const i = publicUrl.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(publicUrl.slice(i + marker.length));
}

async function enviarLogoRestaurante(
  supabase: ReturnType<typeof createBrowserSupabaseClient>,
  restauranteId: string,
  file: File,
): Promise<string> {
  const ext = extensaoImagemSegura(file);
  if (ext === "gif") {
    throw new Error("Use JPG, PNG ou WebP para o logo.");
  }
  const objectPath = `${restauranteId}/${crypto.randomUUID()}.${ext}`;
  const contentType =
    file.type && file.type.startsWith("image/")
      ? file.type
      : `image/${ext === "jpg" ? "jpeg" : ext}`;
  const { error } = await supabase.storage
    .from(BUCKET_RESTAURANT_LOGOS)
    .upload(objectPath, file, { contentType, cacheControl: "3600", upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET_RESTAURANT_LOGOS).getPublicUrl(objectPath);
  return data.publicUrl;
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
  if (row.status !== "ativo" && row.status !== "pausado") return null;
  return {
    id: row.id,
    restaurante_id: row.restaurante_id,
    nome: row.nome,
    preco: toNumber(row.preco),
    descricao: row.descricao,
    imagem: row.imagem ?? null,
    categoria: row.categoria?.trim() || null,
    status: row.status,
  };
}

function mapRestauranteRow(row: {
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
}): Restaurante {
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

const PRESET_CORES_TEMA = [
  "#0d9488",
  "#0071e3",
  "#7c3aed",
  "#ea580c",
  "#dc2626",
  "#059669",
  "#ca8a04",
  "#1d1d1f",
] as const;

function digitsOnly(input: string) {
  return input.replace(/\D/g, "");
}

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

function nextColuna(c: KanbanCol): KanbanCol | null {
  if (c === "recebidos") return "cozinha";
  if (c === "cozinha") return "pronto";
  if (c === "pronto") return "entregue";
  return null;
}

function mensagemParaColuna(p: Pedido, destino: KanbanCol): string {
  if (destino === "cozinha") {
    return `Olá ${p.cliente}, seu pedido entrou em preparo!`;
  }
  if (destino === "pronto") {
    const m = p.motoboy?.trim() || "nossa equipe";
    return `Olá ${p.cliente}, seu pedido está pronto e já saiu para entrega com o motoboy ${m}. Obrigado pela preferência!`;
  }
  if (destino === "entregue") {
    return `Olá ${p.cliente}, seu pedido foi entregue. Obrigado pela preferência!`;
  }
  return `Olá ${p.cliente}, atualização do seu pedido.`;
}

const DRAG_MIME = "application/x-meu-cardapio-pedido-id";

function AdminMissingSlugView() {
  useEffect(() => {
    document.title = "Painel · Cardápio";
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f5f7] px-8 py-20 font-sans text-[#1d1d1f] antialiased">
      <div className="mx-auto max-w-lg text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#86868b]">Painel</p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[#1d1d1f] sm:text-3xl">
          Assinatura pendente
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-[#6e6e73]">
          Não encontramos um restaurante vinculado à sua conta. Conclua o cadastro e o pagamento
          no Stripe para liberar o painel.
        </p>
        <a
          href="/cadastro"
          className="mt-8 inline-flex rounded-xl bg-[#1d1d1f] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-black"
        >
          Ir para cadastro
        </a>
      </div>
    </div>
  );
}

/* ——— Subcomponentes internos (mesmo arquivo) ——— */

function AdminSidebar(props: {
  restaurante: Restaurante;
  tab: AdminTab;
  onTab: (t: AdminTab) => void;
}) {
  const { restaurante, tab, onTab } = props;
  /** Ordem: pedidos → marca (meio, mais visível no scroll horizontal mobile) → cardápio */
  const items: { id: AdminTab; label: string; hint: string; Icon: LucideIcon }[] = [
    { id: "pedidos", label: "Pedidos", hint: "Esteira ao vivo", Icon: ClipboardList },
    {
      id: "configuracoes",
      label: "Marca e vitrine",
      hint: "WhatsApp, cor, link e taxa",
      Icon: Palette,
    },
    { id: "cardapio", label: "Cardápio", hint: "Pratos e preços", Icon: BookOpen },
  ];
  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-zinc-200/80 bg-white/90 backdrop-blur-xl lg:h-screen lg:w-72 lg:border-b-0 lg:border-r lg:border-zinc-200/80">
      <div className="border-b border-black/[0.06] px-5 py-6">
        <div className="flex items-center gap-3">
          <div
            className="grid h-10 w-10 place-items-center rounded-2xl text-sm font-semibold text-white shadow-sm"
            style={{ backgroundColor: restaurante.cor_tema }}
          >
            {restaurante.nome.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-[#1d1d1f]">{restaurante.nome}</p>
            <p className="truncate text-xs text-[#86868b]">Painel admin</p>
          </div>
        </div>
      </div>
      <nav className="flex flex-1 snap-x snap-mandatory flex-row gap-1.5 overflow-x-auto px-2 py-3 lg:snap-none lg:flex-col lg:px-3">
        {items.map((it) => {
          const active = tab === it.id;
          const Icon = it.Icon;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onTab(it.id)}
              className={[
                "flex min-w-[10.5rem] snap-start flex-col rounded-xl px-3 py-2.5 text-left transition sm:min-w-[9.5rem] lg:min-w-0",
                active
                  ? "bg-white text-[#1d1d1f] shadow-[0_1px_3px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.04]"
                  : "text-[#6e6e73] hover:bg-white/70 hover:text-[#1d1d1f]",
              ].join(" ")}
            >
              <span className="flex items-center gap-2">
                <Icon
                  className={[
                    "h-4 w-4 shrink-0",
                    active ? "text-[#0071e3]" : "text-[#86868b]",
                  ].join(" ")}
                  aria-hidden
                />
                <span className="text-sm font-semibold leading-tight">{it.label}</span>
              </span>
              <span className="mt-1 pl-6 text-[11px] leading-snug text-[#86868b]">
                {it.hint}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function PedidoCard(props: {
  pedido: Pedido;
  onAdvance: () => void;
  onEdit: () => void;
  onCancel: () => void;
  canAdvance: boolean;
  onDragEnd?: () => void;
}) {
  const { pedido, onAdvance, onEdit, onCancel, canAdvance, onDragEnd } = props;
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, pedido.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => onDragEnd?.()}
      className="cursor-grab rounded-2xl border border-black/[0.06] bg-white p-4 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] transition hover:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.16)] active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#86868b]">
            {formatPedidoId(pedido.id)}
          </p>
          <h3 className="mt-1 text-sm font-semibold tracking-tight text-[#1d1d1f]">{pedido.cliente}</h3>
          <p className="mt-0.5 text-xs text-[#6e6e73]">{pedido.telefone}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-2 py-1 text-[10px] font-medium text-[#86868b] transition hover:bg-red-50 hover:text-red-600"
        >
          Cancelar
        </button>
      </div>
      <ul className="mt-3 space-y-1 border-t border-black/[0.06] pt-3 text-xs text-[#424245]">
        {pedido.itens.map((line, idx) => (
          <li key={`${pedido.id}-${idx}-${line}`} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#1d1d1f]/25" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#6e6e73]">
        <span className="rounded-full bg-[#f5f5f7] px-2 py-0.5 font-medium text-[#1d1d1f]">
          Total {formatBRL(pedido.total)}
        </span>
        <span className="rounded-full bg-[#f5f5f7] px-2 py-0.5">{pedido.pagamento}</span>
        <span className="rounded-full bg-[#f5f5f7] px-2 py-0.5">Motoboy: {pedido.motoboy}</span>
      </div>
      {pedido.observacoes ? (
        <p className="mt-2 rounded-xl bg-[#f5f5f7] px-3 py-2 text-[11px] leading-relaxed text-[#6e6e73]">
          <span className="font-semibold text-[#86868b]">Obs.</span> {pedido.observacoes}
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-2">
        {canAdvance ? (
          <button
            type="button"
            onClick={onAdvance}
            className="w-full rounded-xl bg-[#1d1d1f] px-3 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-black active:scale-[0.99]"
          >
            Avançar status + WhatsApp
          </button>
        ) : (
          <p className="rounded-xl border border-dashed border-black/[0.08] bg-[#fafafa] px-3 py-2 text-center text-[11px] text-[#86868b]">
            Pedido na etapa final da esteira.
          </p>
        )}
        <button
          type="button"
          onClick={onEdit}
          className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-xs font-semibold text-[#1d1d1f] shadow-sm transition hover:bg-[#f5f5f7]"
        >
          Editar detalhes
        </button>
      </div>
    </article>
  );
}

function ModalPedido(props: {
  open: boolean;
  pedido: Pedido | null;
  onClose: () => void;
  onSave: (patch: { motoboy: string; pagamento: FormaPagamento; observacaoExtra: string }) => void;
}) {
  const { open, pedido, onClose, onSave } = props;
  const [motoboy, setMotoboy] = useState("");
  const [pagamento, setPagamento] = useState<FormaPagamento>("Pix");
  const [obsExtra, setObsExtra] = useState("");

  useEffect(() => {
    if (!open || !pedido) return;
    setMotoboy(pedido.motoboy);
    setPagamento(pedido.pagamento);
    setObsExtra("");
  }, [open, pedido]);

  if (!open || !pedido) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-black/[0.06] bg-[#fbfbfd] p-6 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.25)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#86868b]">
              Editar pedido
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#1d1d1f]">
              {formatPedidoId(pedido.id)} · {pedido.cliente}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-black/[0.08] bg-white px-2 py-1 text-xs text-[#6e6e73] shadow-sm transition hover:bg-[#f5f5f7]"
          >
            Fechar
          </button>
        </div>
        <div className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#86868b]" htmlFor="motoboy">
              Nome do motoboy
            </label>
            <input
              id="motoboy"
              value={motoboy}
              onChange={(e) => setMotoboy(e.target.value)}
              className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm text-[#1d1d1f] shadow-[0_1px_0_rgba(0,0,0,0.04)] outline-none transition focus:border-[#0071e3]/40 focus:ring-2 focus:ring-[#0071e3]/15"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#86868b]" htmlFor="pagamento">
              Forma de pagamento
            </label>
            <select
              id="pagamento"
              value={pagamento}
              onChange={(e) => setPagamento(e.target.value as FormaPagamento)}
              className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm text-[#1d1d1f] shadow-[0_1px_0_rgba(0,0,0,0.04)] outline-none transition focus:border-[#0071e3]/40 focus:ring-2 focus:ring-[#0071e3]/15"
            >
              <option value="Pix">Pix</option>
              <option value="Cartão">Cartão</option>
              <option value="Dinheiro">Dinheiro</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#86868b]" htmlFor="obs-extra">
              Observação de última hora
            </label>
            <textarea
              id="obs-extra"
              rows={3}
              value={obsExtra}
              onChange={(e) => setObsExtra(e.target.value)}
              placeholder='Ex.: "Trocar refrigerante"'
              className="w-full resize-none rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm text-[#1d1d1f] shadow-[0_1px_0_rgba(0,0,0,0.04)] outline-none transition placeholder:text-[#aeaeb2] focus:border-[#0071e3]/40 focus:ring-2 focus:ring-[#0071e3]/15"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-black/[0.08] bg-white px-4 py-2 text-xs font-semibold text-[#1d1d1f] shadow-sm transition hover:bg-[#f5f5f7]"
          >
            Descartar
          </button>
          <button
            type="button"
            onClick={() => onSave({ motoboy, pagamento, observacaoExtra: obsExtra })}
            className="rounded-xl bg-[#0071e3] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0077ed]"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

const emptyPratoForm = {
  nome: "",
  preco: "",
  descricao: "",
  categoria: "",
  status: "ativo" as PratoStatus,
};

function ModalPrato(props: {
  open: boolean;
  mode: "create" | "edit";
  restauranteId: string;
  initial: Prato | null;
  categoriasOpcoes: string[];
  onNovaCategoria: (nome: string) => Promise<void>;
  onClose: () => void;
  onSubmit: (payload: {
    id?: string;
    restaurante_id: string;
    nome: string;
    preco: number;
    descricao: string | null;
    categoria: string | null;
    status: PratoStatus;
    arquivoImagem: File | null;
    imagemAtual: string | null;
  }) => void | Promise<void>;
}) {
  const { open, mode, restauranteId, initial, categoriasOpcoes, onNovaCategoria, onClose, onSubmit } =
    props;
  const [form, setForm] = useState(emptyPratoForm);
  const [arquivoImagem, setArquivoImagem] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (!arquivoImagem) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(arquivoImagem);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [open, arquivoImagem]);

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setArquivoImagem(null);
    if (mode === "edit" && initial) {
      setForm({
        nome: initial.nome,
        preco: String(initial.preco).replace(".", ","),
        descricao: initial.descricao ?? "",
        categoria: initial.categoria?.trim() ?? "",
        status: initial.status,
      });
    } else {
      setForm(emptyPratoForm);
    }
  }, [open, mode, initial]);

  const imagemPreviewPublica =
    mode === "edit" && initial?.imagem?.trim() ? initial.imagem.trim() : null;

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const precoNormalizado = parsePrecoBrasileiro(form.preco);
    if (!form.nome.trim()) {
      setFormError("Informe o nome do prato.");
      return;
    }
    if (precoNormalizado == null) {
      setFormError("Informe um preço válido (ex.: 12,90 ou 1.234,56).");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        id: mode === "edit" && initial ? initial.id : undefined,
        restaurante_id: restauranteId,
        nome: form.nome.trim(),
        preco: precoNormalizado,
        descricao: form.descricao.trim() ? form.descricao.trim() : null,
        categoria: form.categoria.trim() ? form.categoria.trim() : null,
        status: form.status,
        arquivoImagem,
        imagemAtual: mode === "edit" && initial ? (initial.imagem ?? null) : null,
      });
      onClose();
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Não foi possível salvar. Verifique os dados ou tente sem foto.";
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-zinc-100 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
          {mode === "create" ? "Novo prato" : "Editar prato"}
        </h2>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Nome</label>
            <input
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              className="w-full rounded-2xl border border-zinc-200 bg-zinc-50/50 px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-zinc-900"
              required
            />
          </div>
          <CategoriaPratoField
            value={form.categoria?.trim() ? form.categoria.trim() : "Cardápio"}
            onChange={(c) => setForm((f) => ({ ...f, categoria: c === "Cardápio" ? "" : c }))}
            opcoes={categoriasOpcoes}
            onNovaCategoria={onNovaCategoria}
            disabled={submitting}
          />
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Preço (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              value={form.preco}
              onChange={(e) =>
                setForm((f) => ({ ...f, preco: sanitizePrecoBrInput(e.target.value) }))
              }
              onBlur={() =>
                setForm((f) =>
                  f.preco.trim() === ""
                    ? f
                    : { ...f, preco: normalizarPrecoCampoAoSair(f.preco) },
                )
              }
              placeholder="Ex.: 24,90"
              className="w-full rounded-2xl border border-zinc-200 bg-zinc-50/50 px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-zinc-900"
              required
            />
            <p className="text-[11px] leading-relaxed text-zinc-500">
              Ponto (.) vira vírgula automaticamente; ao sair do campo o valor é ajustado com duas
              casas decimais.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Descrição</label>
            <textarea
              value={form.descricao}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
              rows={3}
              className="w-full resize-none rounded-2xl border border-zinc-200 bg-zinc-50/50 px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-zinc-900"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500" htmlFor="prato-imagem-arquivo">
              Foto do prato
            </label>
            <input
              id="prato-imagem-arquivo"
              key={`${mode}-${initial?.id ?? "novo"}`}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setArquivoImagem(f);
              }}
              className="block w-full text-xs text-zinc-500 file:mr-3 file:rounded-xl file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-zinc-900 hover:file:bg-zinc-200"
            />
            {previewUrl || imagemPreviewPublica ? (
              <div className="relative mt-2 aspect-square max-w-[10rem] overflow-hidden rounded-2xl border border-zinc-100 bg-zinc-50 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl ?? imagemPreviewPublica ?? ""}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}
            {mode === "edit" && imagemPreviewPublica && !arquivoImagem ? (
              <p className="text-[11px] text-zinc-500">
                Imagem atual no cardápio. Envie um arquivo acima para substituir.
              </p>
            ) : null}
            {arquivoImagem ? (
              <p className="truncate text-[11px] text-zinc-500" title={arquivoImagem.name}>
                Novo arquivo: {arquivoImagem.name}
              </p>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-100 bg-zinc-50/60 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900">Visível no cardápio</p>
              <p className="text-xs font-normal text-zinc-500">Pausado remove o prato da vitrine pública.</p>
            </div>
            <IosToggle
              tone="success"
              checked={form.status === "ativo"}
              onChange={(on) => setForm((f) => ({ ...f, status: on ? "ativo" : "pausado" }))}
              aria-label={form.status === "ativo" ? "Prato ativo" : "Prato pausado"}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-full border border-zinc-200 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50"
            >
              {submitting ? "Salvando…" : "Salvar"}
            </button>
          </div>
          {formError ? (
            <p className="pt-2 text-center text-xs font-medium text-red-600" role="alert">
              {formError}
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}

function AdminPageInner() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const searchParams = useSearchParams();

  const tenantSlug = useMemo(() => {
    const q = searchParams.get("slug")?.trim() ?? "";
    if (q.length > 0) return q;
    return (process.env.NEXT_PUBLIC_ADMIN_RESTAURANT_SLUG ?? "").trim();
  }, [searchParams]);

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [restaurante, setRestaurante] = useState<Restaurante | null>(null);
  const [tab, setTab] = useState<AdminTab>("pedidos");
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [pratos, setPratos] = useState<Prato[]>([]);
  const [dragOverCol, setDragOverCol] = useState<KanbanCol | null>(null);

  const [pedidoModal, setPedidoModal] = useState<Pedido | null>(null);
  const [pratoModalOpen, setPratoModalOpen] = useState(false);
  const [pratoModalMode, setPratoModalMode] = useState<"create" | "edit">("create");
  const [editingPrato, setEditingPrato] = useState<Prato | null>(null);
  const [resolvingSlug, setResolvingSlug] = useState(false);
  const [cardapioLinkCopied, setCardapioLinkCopied] = useState(false);

  const [tenantSaving, setTenantSaving] = useState(false);
  const [cfgNome, setCfgNome] = useState("");
  const [cfgWhatsapp, setCfgWhatsapp] = useState("");
  const [cfgCor, setCfgCor] = useState("#0d9488");
  const [cfgFuncionamento, setCfgFuncionamento] = useState<FuncionamentoSemana>(() =>
    criarFuncionamentoSemanaVazio(),
  );
  const [cfgTaxasZonas, setCfgTaxasZonas] = useState<TaxaEntregaZona[]>([]);
  const [cfgEntregaModo, setCfgEntregaModo] = useState<EntregaModo>("fixa");
  const [cfgTaxaFixaTexto, setCfgTaxaFixaTexto] = useState("");
  const [cfgRetiradaBalcao, setCfgRetiradaBalcao] = useState(false);
  const [cfgCardapioCategorias, setCfgCardapioCategorias] = useState<string[]>([]);
  const [cfgVitrineFechada, setCfgVitrineFechada] = useState(false);
  const [cfgMensagemFechado, setCfgMensagemFechado] = useState("");
  const [cfgMsg, setCfgMsg] = useState<string | null>(null);
  const [cfgLogoUrl, setCfgLogoUrl] = useState<string | null>(null);
  const [cfgLogoFile, setCfgLogoFile] = useState<File | null>(null);
  const [cfgLogoDraftPreview, setCfgLogoDraftPreview] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (cfgLogoDraftPreview) URL.revokeObjectURL(cfgLogoDraftPreview);
    };
  }, [cfgLogoDraftPreview]);

  useEffect(() => {
    if (tenantSlug) return;

    let cancelled = false;
    setResolvingSlug(true);

    void (async () => {
      const {
        data: { user },
      } = await withRetry(async () => supabase.auth.getUser(), {
        shouldRetry: (r) => isRetryableSupabaseError(r.error),
      });
      if (!user || cancelled) {
        setResolvingSlug(false);
        return;
      }

      const { data, error } = await withRetry(
        async () =>
          supabase
            .from("restaurantes")
            .select("slug")
            .eq("owner_id", user.id)
            .order("criado_em", { ascending: false })
            .limit(1)
            .maybeSingle(),
        { shouldRetry: (r) => isRetryableSupabaseError(r.error) },
      );

      if (cancelled) return;

      if (!error && data?.slug) {
        // Preserva ?checkout=success da volta do Stripe; senão o middleware redireciona
        // para /cadastro antes do webhook gravar a assinatura (parece “travado”).
        const next = new URL("/admin", window.location.origin);
        next.searchParams.set("slug", data.slug);
        const cur = new URLSearchParams(window.location.search);
        if (cur.get("checkout") === "success") {
          next.searchParams.set("checkout", "success");
        }
        if (cur.get("success") === "true") {
          next.searchParams.set("success", "true");
        }
        router.replace(`${next.pathname}?${next.searchParams.toString()}`);
        return;
      }

      setResolvingSlug(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [tenantSlug, supabase, router]);

  const loadData = useCallback(async () => {
    if (!tenantSlug) {
      setLoading(false);
      setFetchError(null);
      setRestaurante(null);
      setPratos([]);
      setPedidos([]);
      return;
    }

    setLoading(true);
    setFetchError(null);
    try {
      if (!isValidSlug(tenantSlug)) {
        setFetchError(
          "Slug inválido. Use apenas letras minúsculas, números e hífens (3 a 64 caracteres), no formato do seu cardápio público.",
        );
        setRestaurante(null);
        setPratos([]);
        setPedidos([]);
        return;
      }

      const { data: restRow, error: restErr } = await withRetry(
        async () =>
          supabase.from("restaurantes").select("*").eq("slug", tenantSlug).maybeSingle(),
        { shouldRetry: (r) => isRetryableSupabaseError(r.error) },
      );

      if (restErr) {
        setFetchError(restErr.message);
        setRestaurante(null);
        setPratos([]);
        setPedidos([]);
        return;
      }
      if (!restRow) {
        setFetchError(
          "Não encontramos um restaurante com o slug informado. Verifique o link ou cadastre o tenant no Supabase.",
        );
        setRestaurante(null);
        setPratos([]);
        setPedidos([]);
        return;
      }

      const {
        data: { user: sessionUser },
      } = await supabase.auth.getUser();

      if (!sessionUser) {
        setFetchError("Sessão expirada. Faça login novamente.");
        setRestaurante(null);
        setPratos([]);
        setPedidos([]);
        return;
      }

      const rowOwner = (restRow as { owner_id?: string | null }).owner_id ?? null;

      if (rowOwner !== sessionUser.id) {
        setFetchError(
          rowOwner == null
            ? "Este cardápio ainda não está vinculado a uma conta (owner_id em branco no banco). Associe o restaurante ao seu usuário no Supabase ou conclua o fluxo de cadastro."
            : "Este cardápio não pertence à sua sessão. Abra o painel pelo menu ou pelo link sem alterar o slug na barra de endereço.",
        );
        setRestaurante(null);
        setPratos([]);
        setPedidos([]);
        return;
      }

      const rest = mapRestauranteRow(restRow as Parameters<typeof mapRestauranteRow>[0]);
      setRestaurante(rest);

      const [{ data: pratosData, error: pratosErr }, { data: pedidosData, error: pedidosErr }] =
        await Promise.all([
          withRetry(
            async () =>
              supabase
                .from("pratos")
                .select("id, restaurante_id, nome, preco, descricao, imagem, status, categoria")
                .eq("restaurante_id", rest.id)
                .order("criado_em", { ascending: false }),
            { shouldRetry: (r) => isRetryableSupabaseError(r.error) },
          ),
          withRetry(
            async () =>
              supabase
                .from("pedidos")
                .select(
                  "id, cliente, telefone, total, pagamento, coluna, observacoes, itens, motoboy, criado_em",
                )
                .eq("restaurante_id", rest.id)
                .order("criado_em", { ascending: true }),
            { shouldRetry: (r) => isRetryableSupabaseError(r.error) },
          ),
        ]);

      if (pratosErr) {
        setFetchError(pratosErr.message);
        setPratos([]);
      } else {
        const mapped = (pratosData ?? [])
          .map((r) => mapPratoRow(r as Parameters<typeof mapPratoRow>[0]))
          .filter((p): p is Prato => p !== null);
        setPratos(mapped);
      }

      if (pedidosErr) {
        setFetchError((prev) =>
          prev ? `${prev} · ${pedidosErr.message}` : pedidosErr.message,
        );
        setPedidos([]);
      } else {
        const mapped = (pedidosData ?? [])
          .map((r) => mapPedidoRow(r as Parameters<typeof mapPedidoRow>[0]))
          .filter((p): p is Pedido => p !== null);
        setPedidos(mapped);
      }
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, [supabase, tenantSlug]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (tab !== "configuracoes" || !restaurante) return;
    setCfgNome(restaurante.rawNome !== "" ? restaurante.rawNome : restaurante.nome);
    setCfgWhatsapp(restaurante.whatsapp);
    const parsedFn = restaurante.funcionamento_semana;
    setCfgFuncionamento(parsedFn ?? criarFuncionamentoSemanaVazio());

    const modo: EntregaModo =
      restaurante.entrega_modo === "zonas"
        ? "zonas"
        : restaurante.entrega_modo === "fixa"
          ? "fixa"
          : (restaurante.taxas_entrega_zonas?.length ?? 0) > 1
            ? "zonas"
            : "fixa";
    setCfgEntregaModo(modo);
    if (modo === "zonas") {
      const tz = restaurante.taxas_entrega_zonas;
      setCfgTaxasZonas(
        tz && tz.length > 0 ? tz : zonasFromLegacyTaxa(restaurante.taxa_entrega) ?? [],
      );
      setCfgTaxaFixaTexto("");
    } else {
      setCfgTaxasZonas([]);
      setCfgTaxaFixaTexto(
        taxaFixaInicialDeRestaurante(restaurante.taxa_entrega, restaurante.taxas_entrega_zonas),
      );
    }

    const from = parseCardapioCategorias(restaurante.cardapio_categorias);
    const fromP = categoriasDistintasDosPratos(pratos);
    const ord = from.length > 0 ? from : fromP;
    const extra = fromP.filter((x) => !ord.includes(x));
    setCfgCardapioCategorias([...new Set([...ord, ...extra])]);

    setCfgRetiradaBalcao(restaurante.retirada_balcao === true);
    setCfgCor(restaurante.cor_tema);
    setCfgLogoUrl(restaurante.logo?.trim() || null);
    setCfgLogoFile(null);
    setCfgLogoDraftPreview(null);
    setCfgVitrineFechada(restaurante.vitrine_fechada === true);
    setCfgMensagemFechado(restaurante.mensagem_fechado ?? "");
    setCfgMsg(null);
  }, [tab, restaurante, pratos]);

  const salvarConfiguracoesTenant = useCallback(async () => {
    if (!restaurante) return;
    const nomeLimpo = cfgNome.trim();
    if (nomeLimpo.length < 2) {
      setCfgMsg("Informe o nome do estabelecimento (mínimo 2 caracteres).");
      return;
    }
    if (!digitsOnly(cfgWhatsapp) || digitsOnly(cfgWhatsapp).length < 10) {
      setCfgMsg("Informe um WhatsApp válido com DDD e número.");
      return;
    }
    const errF = validarFuncionamentoSemana(cfgFuncionamento);
    if (errF) {
      setCfgMsg(errF);
      return;
    }
    const errZ =
      cfgEntregaModo === "zonas" ? validarTaxasZonas(cfgTaxasZonas) : validarTaxasZonas([]);
    if (errZ) {
      setCfgMsg(errZ);
      return;
    }
    if (cfgEntregaModo === "zonas" && cfgTaxasZonas.length === 0) {
      setCfgMsg("Em taxas por bairro, adicione ao menos uma região com nome e valor.");
      return;
    }
    const errCat = validarCardapioCategorias(cfgCardapioCategorias);
    if (errCat) {
      setCfgMsg(errCat);
      return;
    }
    const resumoHorario = formatFuncionamentoResumo(cfgFuncionamento).trim() || null;
    const taxaSync =
      cfgEntregaModo === "fixa"
        ? taxaFixaParaPersistir(cfgTaxaFixaTexto)
        : cfgTaxasZonas.length === 1
          ? Math.round(cfgTaxasZonas[0].valor * 100) / 100
          : null;
    const zonasApi =
      cfgEntregaModo === "zonas" && cfgTaxasZonas.length > 0 ? cfgTaxasZonas : null;
    const corOk = normalizeCorTema(cfgCor);

    let logoOut: string | null;
    let logoUploadWarning: string | null = null;
    if (cfgLogoFile) {
      try {
        logoOut = await enviarLogoRestaurante(supabase, restaurante.id, cfgLogoFile);
        const antiga = restaurante.logo?.trim() ?? "";
        if (antiga && antiga !== logoOut) {
          const pathOld = caminhoStorageLogoRestaurante(antiga);
          if (pathOld) {
            const { error: remErr } = await supabase.storage
              .from(BUCKET_RESTAURANT_LOGOS)
              .remove([pathOld]);
            if (remErr) {
              /* não bloqueia — arquivo antigo pode ficar órfão */
            }
          }
        }
      } catch (err) {
        const msg =
          err && typeof err === "object" && "message" in err
            ? String((err as { message: unknown }).message)
            : "Falha no envio da imagem.";
        logoUploadWarning = `Logo não foi atualizado (${msg}). As demais configurações serão salvas. Crie o bucket "restaurant-logos" no Supabase ou verifique permissões.`;
        logoOut = cfgLogoUrl ?? restaurante.logo?.trim() ?? null;
      }
    } else if (cfgLogoUrl === null) {
      const antiga = restaurante.logo?.trim() ?? "";
      if (antiga) {
        const pathOld = caminhoStorageLogoRestaurante(antiga);
        if (pathOld) {
          const { error: remErr } = await supabase.storage
            .from(BUCKET_RESTAURANT_LOGOS)
            .remove([pathOld]);
          if (remErr) {
            logoUploadWarning =
              "Não foi possível apagar o arquivo antigo no Storage; o link no banco será limpo mesmo assim.";
          }
        }
      }
      logoOut = null;
    } else {
      logoOut = cfgLogoUrl ?? null;
    }

    setTenantSaving(true);
    setCfgMsg(null);
    setFetchError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setCfgMsg("Sessão expirada. Recarregue a página e entre de novo.");
        return;
      }

      const res = await fetch("/api/restaurante/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({
          restauranteId: restaurante.id,
          nome: nomeLimpo,
          whatsapp: cfgWhatsapp.trim(),
          cor_tema: corOk,
          horario_funcionamento: resumoHorario,
          taxa_entrega: taxaSync,
          vitrine_fechada: cfgVitrineFechada,
          mensagem_fechado: cfgVitrineFechada ? cfgMensagemFechado.trim() || null : null,
          funcionamento_semana: cfgFuncionamento,
          taxas_entrega_zonas: zonasApi,
          retirada_balcao: cfgRetiradaBalcao,
          entrega_modo: cfgEntregaModo,
          cardapio_categorias: cfgCardapioCategorias,
          logo: logoOut,
        }),
      });

      const json = (await res.json()) as { error?: string; warning?: string };
      if (!res.ok) {
        setCfgMsg(json.error ?? `Falha ao salvar (${res.status}).`);
        return;
      }
      const partesMsg: string[] = [];
      if (logoUploadWarning) partesMsg.push(logoUploadWarning);
      if (json.warning) partesMsg.push(json.warning);
      if (partesMsg.length) {
        setCfgMsg(partesMsg.join(" "));
      } else {
        setCfgMsg("Configurações salvas com sucesso.");
      }
      window.setTimeout(() => setCfgMsg(null), partesMsg.length ? 14000 : 6000);
      await loadData();
      if (logoUploadWarning) {
        setCfgLogoFile(null);
        setCfgLogoDraftPreview(null);
      }
    } finally {
      setTenantSaving(false);
    }
  }, [
    restaurante,
    cfgNome,
    cfgWhatsapp,
    cfgFuncionamento,
    cfgTaxasZonas,
    cfgEntregaModo,
    cfgTaxaFixaTexto,
    cfgRetiradaBalcao,
    cfgCardapioCategorias,
    cfgCor,
    cfgVitrineFechada,
    cfgMensagemFechado,
    cfgLogoUrl,
    cfgLogoFile,
    supabase,
    loadData,
  ]);

  useEffect(() => {
    const rid = restaurante?.id;
    if (!rid) return;

    const filter = `restaurante_id=eq.${rid}`;
    const channel = supabase
      .channel(`pedidos-restaurante-${rid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pedidos",
          filter,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const mapped = mapPedidoRow(payload.new as Parameters<typeof mapPedidoRow>[0]);
            if (!mapped) return;
            setPedidos((prev) => {
              if (prev.some((p) => p.id === mapped.id)) return prev;
              return [...prev, mapped];
            });
            playNewOrderChime();
            return;
          }
          if (payload.eventType === "UPDATE") {
            const mapped = mapPedidoRow(payload.new as Parameters<typeof mapPedidoRow>[0]);
            const pid = (payload.new as { id?: string }).id;
            if (!pid) return;
            if (!mapped) {
              setPedidos((prev) => prev.filter((p) => p.id !== pid));
              return;
            }
            setPedidos((prev) => {
              const idx = prev.findIndex((p) => p.id === mapped.id);
              if (idx < 0) return [...prev, mapped];
              const next = [...prev];
              next[idx] = mapped;
              return next;
            });
            return;
          }
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string } | null)?.id;
            if (!id) return;
            setPedidos((prev) => prev.filter((p) => p.id !== id));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, restaurante?.id]);

  useEffect(() => {
    if (restaurante?.nome) {
      document.title = `${restaurante.nome} · Painel`;
    } else {
      document.title = "Painel · Cardápio";
    }
  }, [restaurante?.nome]);

  const porColuna = useMemo(() => {
    const map: Record<KanbanCol, Pedido[]> = {
      recebidos: [],
      cozinha: [],
      pronto: [],
      entregue: [],
    };
    for (const p of pedidos) {
      map[p.coluna].push(p);
    }
    return map;
  }, [pedidos]);

  const kpisPedidos = useMemo(() => computePedidoKpis(pedidos), [pedidos]);

  const categoriasOpcoesModal = useMemo(() => {
    const fromRest = parseCardapioCategorias(restaurante?.cardapio_categorias ?? null);
    const fromP = categoriasDistintasDosPratos(pratos);
    return [...new Set([...fromRest, ...fromP, "Cardápio"])].sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );
  }, [restaurante?.cardapio_categorias, pratos]);

  const adicionarCategoriaCardapio = useCallback(
    async (nome: string) => {
      if (!restaurante?.id) throw new Error("Restaurante não carregado.");
      const t = nome.trim();
      const base = parseCardapioCategorias(restaurante.cardapio_categorias ?? null);
      const next = [...new Set([...base, t])];
      const { error } = await supabase
        .from("restaurantes")
        .update({ cardapio_categorias: next })
        .eq("id", restaurante.id);
      if (error) throw new Error(error.message);
      await loadData();
    },
    [restaurante, supabase, loadData],
  );

  const atualizarColunaPedido = async (pedidoId: string, nova: KanbanCol) => {
    const anterior = pedidos.find((p) => p.id === pedidoId);
    if (!anterior || anterior.coluna === nova) return;

    setPedidos((lista) =>
      lista.map((p) => (p.id === pedidoId ? { ...p, coluna: nova } : p)),
    );

    const { error } = await supabase.from("pedidos").update({ coluna: nova }).eq("id", pedidoId);
    if (error) {
      setFetchError(error.message);
      setPedidos((lista) =>
        lista.map((p) => (p.id === pedidoId ? { ...p, coluna: anterior.coluna } : p)),
      );
    }
  };

  const avancarPedido = async (id: string) => {
    const atual = pedidos.find((p) => p.id === id);
    if (!atual) return;
    const destino = nextColuna(atual.coluna);
    if (!destino) return;

    const prev = atual.coluna;
    setPedidos((lista) =>
      lista.map((p) => (p.id === id ? { ...p, coluna: destino } : p)),
    );

    const { error } = await supabase.from("pedidos").update({ coluna: destino }).eq("id", id);
    if (error) {
      setFetchError(error.message);
      setPedidos((lista) =>
        lista.map((p) => (p.id === id ? { ...p, coluna: prev } : p)),
      );
      return;
    }

    const msg = mensagemParaColuna(atual, destino);
    const url = waMeUrl(atual.telefone, msg);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const cancelarPedido = async (id: string) => {
    const prev = pedidos;
    setPedidos((lista) => lista.filter((p) => p.id !== id));
    setPedidoModal((cur) => (cur?.id === id ? null : cur));

    const { error } = await supabase.from("pedidos").delete().eq("id", id);
    if (error) {
      setFetchError(error.message);
      setPedidos(prev);
    }
  };

  const salvarPedidoModal = async (patch: {
    motoboy: string;
    pagamento: FormaPagamento;
    observacaoExtra: string;
  }) => {
    if (!pedidoModal) return;
    const id = pedidoModal.id;
    const extra = patch.observacaoExtra.trim();
    const observacoes =
      extra.length > 0
        ? [pedidoModal.observacoes.trim(), extra].filter(Boolean).join(" · ")
        : pedidoModal.observacoes;
    const motoboy = patch.motoboy.trim() || pedidoModal.motoboy;

    const prevList = pedidos;
    setPedidos((lista) =>
      lista.map((p) =>
        p.id === id
          ? { ...p, motoboy, pagamento: patch.pagamento, observacoes }
          : p,
      ),
    );
    setPedidoModal(null);

    const { error } = await supabase
      .from("pedidos")
      .update({
        motoboy,
        pagamento: patch.pagamento,
        observacoes,
      })
      .eq("id", id);

    if (error) {
      setFetchError(error.message);
      setPedidos(prevList);
    }
  };

  const openCreatePrato = () => {
    setPratoModalMode("create");
    setEditingPrato(null);
    setPratoModalOpen(true);
  };

  const openEditPrato = (prato: Prato) => {
    setPratoModalMode("edit");
    setEditingPrato(prato);
    setPratoModalOpen(true);
  };

  const handleSavePrato = async (payload: {
    id?: string;
    restaurante_id: string;
    nome: string;
    preco: number;
    descricao: string | null;
    categoria: string | null;
    status: PratoStatus;
    arquivoImagem: File | null;
    imagemAtual: string | null;
  }) => {
    const precoDb = Math.round(payload.preco * 100) / 100;
    let imagemFinal: string | null = payload.imagemAtual;
    let urlAntigaParaRemover: string | null = null;

    if (payload.arquivoImagem) {
      try {
        const novaUrl = await enviarImagemAoBucketImagensPratos(
          supabase,
          payload.restaurante_id,
          payload.arquivoImagem,
        );
        const antiga = payload.imagemAtual?.trim() ?? "";
        if (payload.id && antiga.length > 0 && antiga !== novaUrl) {
          urlAntigaParaRemover = antiga;
        }
        imagemFinal = novaUrl;
      } catch (err) {
        const msg =
          err && typeof err === "object" && "message" in err
            ? String((err as { message: unknown }).message)
            : "Não foi possível enviar a foto. Tente outra imagem ou salve sem foto.";
        setFetchError(msg);
        throw new Error(msg);
      }
    }

    if (payload.id) {
      const { error } = await supabase
        .from("pratos")
        .update({
          nome: payload.nome,
          preco: precoDb,
          descricao: payload.descricao,
          categoria: payload.categoria,
          status: payload.status,
          imagem: imagemFinal,
        })
        .eq("id", payload.id);

      if (error) {
        const msg = mensagemErroSupabasePainel(error.message);
        setFetchError(msg);
        throw new Error(msg);
      }
      if (urlAntigaParaRemover) {
        const pathAntigo = caminhoStorageDeUrlPublica(urlAntigaParaRemover);
        if (pathAntigo) {
          const { error: remErr } = await supabase.storage
            .from(BUCKET_IMAGENS_PRATOS)
            .remove([pathAntigo]);
          if (remErr) {
            setFetchError(
              (prev) =>
                prev
                  ? `${prev} · Não foi possível remover a imagem antiga: ${remErr.message}`
                  : `Não foi possível remover a imagem antiga: ${remErr.message}`,
            );
          }
        }
      }
      setPratos((lista) =>
        lista.map((p) =>
          p.id === payload.id
            ? {
                ...p,
                nome: payload.nome,
                preco: precoDb,
                descricao: payload.descricao,
                categoria: payload.categoria,
                status: payload.status,
                imagem: imagemFinal,
              }
            : p,
        ),
      );
    } else {
      /** RLS: `restaurante_id` obrigatório no insert para políticas `owners_insert_pratos`. */
      const { data, error } = await supabase
        .from("pratos")
        .insert({
          restaurante_id: payload.restaurante_id,
          nome: payload.nome,
          preco: precoDb,
          descricao: payload.descricao,
          categoria: payload.categoria,
          status: payload.status,
          imagem: imagemFinal,
        })
        .select("id, restaurante_id, nome, preco, descricao, imagem, status, categoria")
        .single();

      if (error) {
        const msg = mensagemErroSupabasePainel(error.message);
        setFetchError(msg);
        throw new Error(msg);
      }
      const mapped = mapPratoRow(data as Parameters<typeof mapPratoRow>[0]);
      if (mapped) setPratos((lista) => [mapped, ...lista]);
    }
  };

  const handleDeletePrato = async (prato: Prato) => {
    const prev = pratos;
    const fotoUrl = prato.imagem?.trim() ?? null;
    setPratos((lista) => lista.filter((p) => p.id !== prato.id));

    const { error } = await supabase.from("pratos").delete().eq("id", prato.id);
    if (error) {
      setFetchError(mensagemErroSupabasePainel(error.message));
      setPratos(prev);
      return;
    }

    if (fotoUrl) {
      const path = caminhoStorageDeUrlPublica(fotoUrl);
      if (path) {
        const { error: stErr } = await supabase.storage
          .from(BUCKET_IMAGENS_PRATOS)
          .remove([path]);
        if (stErr) {
          setFetchError(
            (cur) =>
              cur
                ? `${cur} · Foto não removida do storage: ${stErr.message}`
                : `Foto não removida do storage: ${stErr.message}`,
          );
        }
      }
    }
  };

  const pratosRows = restaurante
    ? pratos.filter((p) => p.restaurante_id === restaurante.id)
    : [];

  const cardapioPublicoUrl = useMemo(() => {
    if (!restaurante?.slug) return "";
    const base = getPublicAppUrl().replace(/\/$/, "");
    return `${base}/${encodeURIComponent(restaurante.slug)}`;
  }, [restaurante?.slug]);

  const colunas: { id: KanbanCol; title: string; accent: string }[] = [
    { id: "recebidos", title: "Pendente", accent: "from-sky-500/10 to-transparent" },
    { id: "cozinha", title: "Preparando", accent: "from-amber-500/10 to-transparent" },
    { id: "pronto", title: "Pronto", accent: "from-emerald-500/10 to-transparent" },
    { id: "entregue", title: "Entregue", accent: "from-zinc-400/10 to-transparent" },
  ];

  if (!tenantSlug) {
    if (resolvingSlug) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7] font-sans text-[#6e6e73] antialiased">
          <p className="text-sm font-medium">Localizando seu restaurante…</p>
        </div>
      );
    }
    return <AdminMissingSlugView />;
  }

  if (loading && !restaurante) {
    return <PedidosDashboardSkeleton variant="full" />;
  }

  if (!restaurante) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f5f5f7] px-6 text-center font-sans text-[#424245] antialiased">
        <p className="max-w-md text-sm leading-relaxed text-[#6e6e73]">{fetchError}</p>
        <button
          type="button"
          onClick={() => void loadData()}
          className="rounded-xl border border-black/[0.08] bg-white px-4 py-2 text-xs font-semibold text-[#1d1d1f] shadow-sm transition hover:bg-[#fbfbfd]"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-zinc-50 font-sans text-zinc-900 antialiased">
      <AdminSidebar restaurante={restaurante} tab={tab} onTab={setTab} />

      <main className="flex min-h-0 flex-1 flex-col">
        <header className="border-b border-black/[0.06] bg-[#fbfbfd]/95 px-5 py-5 backdrop-blur-xl sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-[#1d1d1f]">
                {tab === "pedidos"
                  ? "Painel de operações"
                  : tab === "cardapio"
                    ? "Cardápio"
                    : "Marca e vitrine"}
              </h1>
              <p className="mt-1 text-sm text-[#86868b]">
                {tab === "configuracoes" ? (
                  <>
                    <span className="text-[#6e6e73]">
                      Link público, WhatsApp dos pedidos, horário, taxa e cor — o que o cliente vê no
                      cardápio.
                    </span>{" "}
                    <span className="text-[#aeaeb2]">·</span>{" "}
                    <span className="font-medium text-[#424245]">{restaurante.nome}</span>
                  </>
                ) : (
                  <>
                    Tenant: <span className="font-medium text-[#424245]">{restaurante.nome}</span>
                    {tab === "pedidos" && !loading ? (
                      <span className="ml-2 text-xs text-[#aeaeb2]">· KPIs e esteira ao vivo</span>
                    ) : null}
                    {loading ? (
                      <span className="ml-2 text-xs text-[#aeaeb2]">· sincronizando…</span>
                    ) : null}
                  </>
                )}
              </p>
            </div>
            {tab === "cardapio" ? (
              <button
                type="button"
                onClick={openCreatePrato}
                className="inline-flex items-center justify-center rounded-xl bg-[#1d1d1f] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-black"
              >
                Novo prato
              </button>
            ) : tab === "pedidos" ? (
              <button
                type="button"
                disabled={loading}
                onClick={() => void loadData()}
                className="inline-flex items-center justify-center rounded-xl border border-black/[0.08] bg-white px-4 py-2.5 text-sm font-semibold text-[#1d1d1f] shadow-sm transition hover:bg-[#fbfbfd] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Atualizando…" : "Atualizar pedidos"}
              </button>
            ) : null}
          </div>
        </header>

        {fetchError ? (
          <div className="border-b border-amber-200/80 bg-amber-50 px-5 py-3 text-sm text-amber-900 sm:px-8">
            {fetchError}
            <button
              type="button"
              className="ml-3 text-xs font-semibold text-amber-800 underline decoration-amber-800/30 underline-offset-2"
              onClick={() => setFetchError(null)}
            >
              dispensar
            </button>
          </div>
        ) : null}

        <div className="flex-1 overflow-auto px-4 py-6 sm:px-8">
          {tab === "pedidos" ? (
            loading ? (
              <PedidosDashboardSkeleton variant="embedded" />
            ) : (
              <>
                <PedidosKpiBar kpis={kpisPedidos} />
                {pedidos.length === 0 ? (
                  <PedidosEmptyState />
                ) : (
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
                    {colunas.map((col) => (
                      <section
                        key={col.id}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          setDragOverCol(col.id);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOverCol(null);
                          const id = e.dataTransfer.getData(DRAG_MIME);
                          if (!id) return;
                          void atualizarColunaPedido(id, col.id);
                        }}
                        className={[
                          "flex min-h-[420px] flex-col rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm transition",
                          dragOverCol === col.id ? "ring-2 ring-zinc-900/20 border-zinc-300" : "",
                        ].join(" ")}
                      >
                        <div
                          className={`mb-4 rounded-xl bg-gradient-to-r ${col.accent} px-3 py-3 ring-1 ring-zinc-100`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <h2 className="text-sm font-semibold tracking-tight text-zinc-900">{col.title}</h2>
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                              {porColuna[col.id].length}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
                          {porColuna[col.id].map((p) => (
                            <PedidoCard
                              key={p.id}
                              pedido={p}
                              canAdvance={nextColuna(p.coluna) !== null}
                              onAdvance={() => void avancarPedido(p.id)}
                              onEdit={() => setPedidoModal(p)}
                              onCancel={() => void cancelarPedido(p.id)}
                              onDragEnd={() => setDragOverCol(null)}
                            />
                          ))}
                          {porColuna[col.id].length === 0 ? (
                            <p className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/80 px-4 py-10 text-center text-xs text-zinc-500">
                              Nenhum pedido nesta coluna. Arraste um card de outra coluna ou aguarde novos
                              pedidos.
                            </p>
                          ) : null}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </>
            )
          ) : null}

          {tab === "cardapio" ? (
            <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-[0_8px_30px_-16px_rgba(0,0,0,0.12)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight text-[#1d1d1f]">Pratos</h2>
                  <p className="text-xs text-[#86868b]">
                    Itens visíveis no link público; alterações aparecem na hora para o cliente.
                  </p>
                </div>
                <span className="rounded-full bg-[#f5f5f7] px-3 py-1 text-xs font-medium text-[#6e6e73]">
                  {pratosRows.length} {pratosRows.length === 1 ? "item" : "itens"}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-black/[0.06] text-left text-sm">
                  <thead className="bg-[#fafafa] text-[11px] font-semibold uppercase tracking-wide text-[#86868b]">
                    <tr>
                      <th className="px-5 py-3 font-medium">Nome</th>
                      <th className="px-5 py-3 font-medium">Categoria</th>
                      <th className="px-5 py-3 font-medium">Preço</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 text-right font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.06]">
                    {pratosRows.map((prato) => (
                      <tr key={prato.id} className="transition hover:bg-[#fafafa]/80">
                        <td className="px-5 py-3">
                          <div className="font-medium text-[#1d1d1f]">{prato.nome}</div>
                          {prato.descricao ? (
                            <div className="mt-0.5 line-clamp-2 text-xs text-[#86868b]">
                              {prato.descricao}
                            </div>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-[#424245]">
                          {prato.categoria?.trim() ? prato.categoria : (
                            <span className="text-[#aeaeb2]">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-[#424245]">
                          {formatBRL(prato.preco)}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={[
                              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                              prato.status === "ativo"
                                ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/60"
                                : "bg-amber-50 text-amber-900 ring-1 ring-amber-200/60",
                            ].join(" ")}
                          >
                            {prato.status === "ativo" ? "Ativo" : "Pausado"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openEditPrato(prato)}
                            className="mr-2 rounded-lg px-2 py-1 text-xs font-semibold text-[#0071e3] transition hover:bg-[#0071e3]/8"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeletePrato(prato)}
                            className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                          >
                            Excluir
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {tab === "configuracoes" ? (
            <section className="mx-auto max-w-2xl space-y-6">
              <div className="rounded-3xl border border-zinc-100 bg-white px-5 py-6 shadow-sm sm:px-7 sm:py-8">
                <p className="text-xs font-medium uppercase tracking-wide text-[#86868b]">Link público</p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <a
                    href={cardapioPublicoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate text-sm font-medium text-[#0071e3] underline-offset-2 hover:underline"
                  >
                    {cardapioPublicoUrl}
                  </a>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(cardapioPublicoUrl);
                          setCardapioLinkCopied(true);
                          window.setTimeout(() => setCardapioLinkCopied(false), 2000);
                        } catch {
                          setFetchError(
                            "Não foi possível copiar. Selecione o link e copie manualmente.",
                          );
                        }
                      }}
                      className="rounded-full border border-black/[0.08] bg-[#f5f5f7] px-3 py-1.5 text-xs font-semibold text-[#1d1d1f] transition hover:bg-[#ececee]"
                    >
                      {cardapioLinkCopied ? "Copiado" : "Copiar"}
                    </button>
                    <a
                      href={cardapioPublicoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full bg-[#1d1d1f] px-3 py-1.5 text-center text-xs font-semibold text-white transition hover:bg-black"
                    >
                      Abrir
                    </a>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-zinc-100 bg-white px-5 py-6 shadow-sm sm:px-7 sm:py-8">
                <div className="flex flex-col gap-4 border-b border-zinc-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Estabelecimento</h2>
                  <button
                    type="button"
                    disabled={tenantSaving}
                    onClick={() => void salvarConfiguracoesTenant()}
                    className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {tenantSaving ? "Salvando…" : "Salvar"}
                  </button>
                </div>

                <div className="mt-6 space-y-8">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Nome</label>
                    <input
                      type="text"
                      value={cfgNome}
                      onChange={(e) => setCfgNome(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-zinc-900"
                      autoComplete="organization"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      WhatsApp (pedidos)
                    </label>
                    <PhoneInput
                      value={cfgWhatsapp}
                      onChange={setCfgWhatsapp}
                      placeholder="DDD e número"
                      className="flex flex-col gap-2 sm:flex-row sm:items-stretch"
                    />
                  </div>

                  <FuncionamentoSemanalForm value={cfgFuncionamento} onChange={setCfgFuncionamento} />

                  <div className="rounded-2xl border border-zinc-100 bg-zinc-50/50 p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-zinc-900">Status do estabelecimento</p>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                          Quando fechado para pedidos, o cardápio público continua visível, mas o cliente não monta
                          pedido nem envia pelo WhatsApp.
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-zinc-100 bg-white px-4 py-3 shadow-sm">
                        <span className="text-sm font-medium text-zinc-500">
                          {!cfgVitrineFechada ? "Aberto" : "Fechado"}
                        </span>
                        <IosToggle
                          checked={!cfgVitrineFechada}
                          onChange={(aberto) => setCfgVitrineFechada(!aberto)}
                          aria-label="Aberto ou fechado para pedidos no cardápio"
                        />
                      </div>
                    </div>
                    {cfgVitrineFechada ? (
                      <div className="mt-4 space-y-2 border-t border-zinc-100 pt-4">
                        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Mensagem no aviso (opcional)
                        </label>
                        <textarea
                          value={cfgMensagemFechado}
                          onChange={(e) => setCfgMensagemFechado(e.target.value.slice(0, 400))}
                          rows={2}
                          maxLength={400}
                          placeholder="Ex.: voltamos amanhã às 11h"
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-zinc-900"
                        />
                      </div>
                    ) : null}
                  </div>

                  <EntregaComercialSection
                    entregaModo={cfgEntregaModo}
                    onEntregaModo={setCfgEntregaModo}
                    taxaFixaTexto={cfgTaxaFixaTexto}
                    onTaxaFixaTexto={setCfgTaxaFixaTexto}
                    zonas={cfgTaxasZonas}
                    onZonas={setCfgTaxasZonas}
                    retiradaBalcao={cfgRetiradaBalcao}
                    onRetiradaBalcao={setCfgRetiradaBalcao}
                  />

                  <RestauranteLogoUploadField
                    displayUrl={cfgLogoDraftPreview ?? cfgLogoUrl}
                    hasPendingFile={cfgLogoFile !== null}
                    disabled={tenantSaving}
                    onSelectFile={(file) => {
                      setCfgLogoFile(file);
                      setCfgLogoDraftPreview(URL.createObjectURL(file));
                    }}
                    onClear={() => {
                      setCfgLogoFile(null);
                      setCfgLogoUrl(null);
                      setCfgLogoDraftPreview(null);
                    }}
                  />

                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Cor da marca</p>
                    <div className="flex flex-wrap items-center gap-3">
                      {PRESET_CORES_TEMA.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          title={hex}
                          onClick={() => setCfgCor(hex)}
                          className={[
                            "h-9 w-9 rounded-full border-2 border-white shadow-sm ring-2 transition",
                            normalizeCorTema(cfgCor) === hex
                              ? "ring-zinc-900 ring-offset-2"
                              : "ring-zinc-200 hover:ring-zinc-300",
                          ].join(" ")}
                          style={{ backgroundColor: hex }}
                          aria-label={`Cor ${hex}`}
                          aria-pressed={normalizeCorTema(cfgCor) === hex}
                        />
                      ))}
                      <input
                        type="color"
                        aria-label="Cor personalizada"
                        value={normalizeCorTema(cfgCor)}
                        onChange={(e) => setCfgCor(normalizeCorTema(e.target.value))}
                        className="h-9 w-12 cursor-pointer overflow-hidden rounded-lg border-0 bg-transparent p-0"
                      />
                      <input
                        type="text"
                        value={cfgCor}
                        onChange={(e) => setCfgCor(e.target.value)}
                        spellCheck={false}
                        className="w-28 rounded-lg border border-zinc-200 bg-zinc-50/80 px-2 py-1.5 font-mono text-xs text-zinc-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-zinc-900"
                      />
                    </div>
                  </div>

                  {cfgMsg ? (
                    <p
                      className={
                        cfgMsg === "Configurações salvas com sucesso."
                          ? "text-sm font-medium text-emerald-700"
                          : cfgMsg.startsWith("Horário e taxa não foram gravados") ||
                              cfgMsg.startsWith("Parte dos dados")
                            ? "text-sm font-medium text-amber-800"
                            : "text-sm font-medium text-red-600"
                      }
                      role="status"
                    >
                      {cfgMsg}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </main>

      <ModalPedido
        open={pedidoModal !== null}
        pedido={pedidoModal}
        onClose={() => setPedidoModal(null)}
        onSave={(patch) => void salvarPedidoModal(patch)}
      />

      <ModalPrato
        open={pratoModalOpen}
        mode={pratoModalMode}
        restauranteId={restaurante.id}
        initial={editingPrato}
        categoriasOpcoes={categoriasOpcoesModal}
        onNovaCategoria={adicionarCategoriaCardapio}
        onClose={() => setPratoModalOpen(false)}
        onSubmit={handleSavePrato}
      />
    </div>
  );
}

function AdminPageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7] font-sans text-[#6e6e73] antialiased">
      <p className="text-sm font-medium">Carregando painel…</p>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<AdminPageFallback />}>
      <AdminPageInner />
    </Suspense>
  );
}
