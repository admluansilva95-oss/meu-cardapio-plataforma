"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Prato, PratoStatus, Restaurante } from "../../types";
import { createBrowserSupabaseClient } from "@/lib/supabase";

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
}): Pedido | null {
  if (!isKanbanCol(row.coluna)) return null;
  if (!isFormaPagamento(row.pagamento)) return null;
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
  };
}

const BUCKET_IMAGENS_PRATOS = "imagens-pratos";

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
}): Restaurante {
  return {
    id: row.id,
    nome: resolveRestauranteDisplayNome(row.nome, row.slug),
    slug: row.slug,
    whatsapp: row.whatsapp,
    logo: row.logo ?? null,
    cor_tema: row.cor_tema,
  };
}

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
          Informe o restaurante
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-[#6e6e73]">
          O painel multitenant carrega dados do Supabase pelo{" "}
          <span className="font-medium text-[#424245]">slug</span> do restaurante. Abra esta página com o parâmetro na
          URL, por exemplo:
        </p>
        <p className="mt-6 rounded-2xl border border-black/[0.06] bg-[#fbfbfd] px-4 py-3 font-mono text-xs text-[#424245] shadow-[0_8px_30px_-20px_rgba(0,0,0,0.12)]">
          /admin?slug=seu-restaurante
        </p>
        <p className="mt-5 text-xs leading-relaxed text-[#86868b]">
          Em deploy na Vercel você pode definir{" "}
          <code className="rounded bg-black/[0.04] px-1.5 py-0.5 font-mono text-[11px]">
            NEXT_PUBLIC_ADMIN_RESTAURANT_SLUG
          </code>{" "}
          como padrão quando não houver query string.
        </p>
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
  const items: { id: AdminTab; label: string; hint: string }[] = [
    { id: "pedidos", label: "Pedidos", hint: "Esteira Kanban" },
    { id: "cardapio", label: "Cardápio", hint: "Lista de pratos" },
    { id: "configuracoes", label: "Configurações", hint: "Tenant e integrações" },
  ];
  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-black/[0.06] bg-[#f5f5f7]/90 backdrop-blur-xl lg:h-screen lg:w-64 lg:border-b-0 lg:border-r lg:border-black/[0.06]">
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
      <nav className="flex flex-1 flex-row gap-1 overflow-x-auto px-2 py-3 lg:flex-col lg:px-3">
        {items.map((it) => {
          const active = tab === it.id;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onTab(it.id)}
              className={[
                "flex min-w-[8.5rem] flex-col rounded-xl px-3 py-2.5 text-left transition lg:min-w-0",
                active
                  ? "bg-white text-[#1d1d1f] shadow-[0_1px_3px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.04]"
                  : "text-[#6e6e73] hover:bg-white/70 hover:text-[#1d1d1f]",
              ].join(" ")}
            >
              <span className="text-sm font-semibold">{it.label}</span>
              <span className="text-[11px] text-[#86868b]">{it.hint}</span>
            </button>
          );
        })}
      </nav>
      <div className="hidden border-t border-black/[0.06] p-4 text-[11px] text-[#86868b] lg:block">
        Slug: <span className="font-mono text-[#424245]">{restaurante.slug}</span>
      </div>
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
  const { open, mode, restauranteId, initial, onClose, onSubmit } = props;
  const [form, setForm] = useState(emptyPratoForm);
  const [arquivoImagem, setArquivoImagem] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
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

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const precoNormalizado = Number(form.preco.replace(/\s/g, "").replace(",", "."));
    if (!form.nome.trim() || Number.isNaN(precoNormalizado) || precoNormalizado < 0) return;
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
    } catch {
      // Erro de rede / Supabase: o pai pode ter setado mensagem; modal permanece aberto.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-black/[0.06] bg-[#fbfbfd] p-6 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.25)]">
        <h2 className="text-lg font-semibold tracking-tight text-[#1d1d1f]">
          {mode === "create" ? "Novo prato" : "Editar prato"}
        </h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[#86868b]">Nome</label>
            <input
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm text-[#1d1d1f] shadow-[0_1px_0_rgba(0,0,0,0.04)] outline-none transition focus:border-[#0071e3]/40 focus:ring-2 focus:ring-[#0071e3]/15"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[#86868b]">Categoria</label>
            <input
              value={form.categoria}
              onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
              placeholder="Ex.: Entradas, Burgers, Bebidas"
              className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm text-[#1d1d1f] shadow-[0_1px_0_rgba(0,0,0,0.04)] outline-none transition placeholder:text-[#aeaeb2] focus:border-[#0071e3]/40 focus:ring-2 focus:ring-[#0071e3]/15"
            />
            <p className="text-[11px] leading-relaxed text-[#86868b]">
              Aparece agrupada na vitrine pública. Deixe em branco para ir em &quot;Cardápio&quot;.
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[#86868b]">Preço (R$)</label>
            <input
              value={form.preco}
              onChange={(e) => setForm((f) => ({ ...f, preco: e.target.value }))}
              className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm text-[#1d1d1f] shadow-[0_1px_0_rgba(0,0,0,0.04)] outline-none transition focus:border-[#0071e3]/40 focus:ring-2 focus:ring-[#0071e3]/15"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[#86868b]">Descrição</label>
            <textarea
              value={form.descricao}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
              rows={3}
              className="w-full resize-none rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm text-[#1d1d1f] shadow-[0_1px_0_rgba(0,0,0,0.04)] outline-none transition focus:border-[#0071e3]/40 focus:ring-2 focus:ring-[#0071e3]/15"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[#86868b]" htmlFor="prato-imagem-arquivo">
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
              className="block w-full text-xs text-[#6e6e73] file:mr-3 file:rounded-lg file:border-0 file:bg-[#f5f5f7] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[#1d1d1f] hover:file:bg-[#e8e8ed]"
            />
            {mode === "edit" && initial?.imagem && !arquivoImagem ? (
              <p className="text-[11px] text-[#86868b]">
                Imagem atual no cardápio. Envie um arquivo acima para substituir.
              </p>
            ) : null}
            {arquivoImagem ? (
              <p className="truncate text-[11px] text-[#6e6e73]" title={arquivoImagem.name}>
                Selecionado: {arquivoImagem.name}
              </p>
            ) : null}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[#86868b]">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PratoStatus }))}
              className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm text-[#1d1d1f] shadow-[0_1px_0_rgba(0,0,0,0.04)] outline-none transition focus:border-[#0071e3]/40 focus:ring-2 focus:ring-[#0071e3]/15"
            >
              <option value="ativo">Ativo</option>
              <option value="pausado">Pausado</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-black/[0.08] bg-white px-4 py-2 text-xs font-medium text-[#1d1d1f] shadow-sm transition hover:bg-[#f5f5f7] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-[#0071e3] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0077ed] disabled:opacity-50"
            >
              {submitting ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AdminPageInner() {
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
      const { data: restRow, error: restErr } = await supabase
        .from("restaurantes")
        .select("id, nome, slug, whatsapp, logo, cor_tema")
        .eq("slug", tenantSlug)
        .maybeSingle();

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

      const rest = mapRestauranteRow(restRow as Parameters<typeof mapRestauranteRow>[0]);
      setRestaurante(rest);

      const [{ data: pratosData, error: pratosErr }, { data: pedidosData, error: pedidosErr }] =
        await Promise.all([
          supabase
            .from("pratos")
            .select("id, restaurante_id, nome, preco, descricao, imagem, status, categoria")
            .eq("restaurante_id", rest.id)
            .order("criado_em", { ascending: false }),
          supabase
            .from("pedidos")
            .select("id, cliente, telefone, total, pagamento, coluna, observacoes, itens, motoboy")
            .eq("restaurante_id", rest.id)
            .order("criado_em", { ascending: true }),
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
    let imagemFinal: string | null = payload.imagemAtual;
    let urlAntigaParaRemover: string | null = null;

    if (payload.arquivoImagem) {
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
    }

    if (payload.id) {
      const { error } = await supabase
        .from("pratos")
        .update({
          nome: payload.nome,
          preco: payload.preco,
          descricao: payload.descricao,
          categoria: payload.categoria,
          status: payload.status,
          imagem: imagemFinal,
        })
        .eq("id", payload.id);

      if (error) {
        setFetchError(error.message);
        throw error;
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
                preco: payload.preco,
                descricao: payload.descricao,
                categoria: payload.categoria,
                status: payload.status,
                imagem: imagemFinal,
              }
            : p,
        ),
      );
    } else {
      const { data, error } = await supabase
        .from("pratos")
        .insert({
          restaurante_id: payload.restaurante_id,
          nome: payload.nome,
          preco: payload.preco,
          descricao: payload.descricao,
          categoria: payload.categoria,
          status: payload.status,
          imagem: imagemFinal,
        })
        .select("id, restaurante_id, nome, preco, descricao, imagem, status, categoria")
        .single();

      if (error) {
        setFetchError(error.message);
        throw error;
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
      setFetchError(error.message);
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

  const colunas: { id: KanbanCol; title: string; accent: string }[] = [
    { id: "recebidos", title: "Pendente", accent: "from-sky-500/10 to-transparent" },
    { id: "cozinha", title: "Preparando", accent: "from-amber-500/10 to-transparent" },
    { id: "pronto", title: "Pronto", accent: "from-emerald-500/10 to-transparent" },
    { id: "entregue", title: "Entregue", accent: "from-zinc-400/10 to-transparent" },
  ];

  if (!tenantSlug) {
    return <AdminMissingSlugView />;
  }

  if (loading && !restaurante) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7] font-sans text-[#6e6e73] antialiased">
        <p className="text-sm font-medium">Carregando painel…</p>
      </div>
    );
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
    <div className="flex min-h-screen bg-[#f5f5f7] font-sans text-[#1d1d1f] antialiased">
      <AdminSidebar restaurante={restaurante} tab={tab} onTab={setTab} />

      <main className="flex min-h-0 flex-1 flex-col">
        <header className="border-b border-black/[0.06] bg-[#fbfbfd]/95 px-5 py-5 backdrop-blur-xl sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-[#1d1d1f]">
                {tab === "pedidos"
                  ? "Esteira de pedidos"
                  : tab === "cardapio"
                    ? "Cardápio"
                    : "Configurações"}
              </h1>
              <p className="mt-1 text-sm text-[#86868b]">
                Tenant: <span className="font-medium text-[#424245]">{restaurante.nome}</span>
                {loading ? (
                  <span className="ml-2 text-xs text-[#aeaeb2]">· sincronizando…</span>
                ) : null}
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
                    "flex min-h-[420px] flex-col rounded-2xl border border-black/[0.06] bg-white p-4 shadow-[0_8px_30px_-16px_rgba(0,0,0,0.12)] transition",
                    dragOverCol === col.id
                      ? "ring-2 ring-[#0071e3]/25 border-[#0071e3]/30"
                      : "",
                  ].join(" ")}
                >
                  <div
                    className={`mb-4 rounded-xl bg-gradient-to-r ${col.accent} px-3 py-3 ring-1 ring-black/[0.04]`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold tracking-tight text-[#1d1d1f]">{col.title}</h2>
                      <span className="rounded-full bg-[#f5f5f7] px-2 py-0.5 text-[11px] font-medium text-[#6e6e73]">
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
                      <p className="rounded-2xl border border-dashed border-black/[0.08] bg-[#fafafa] px-4 py-10 text-center text-xs text-[#86868b]">
                        Nenhum pedido nesta coluna. Arraste um card de outra coluna ou crie pedidos no
                        Supabase.
                      </p>
                    ) : null}
                  </div>
                </section>
              ))}
            </div>
          ) : null}

          {tab === "cardapio" ? (
            <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-[0_8px_30px_-16px_rgba(0,0,0,0.12)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight text-[#1d1d1f]">Pratos</h2>
                  <p className="text-xs text-[#86868b]">
                    Dados ao vivo do Supabase · slug{" "}
                    <span className="font-mono text-[#424245]">{restaurante.slug}</span>
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
            <section className="max-w-2xl rounded-2xl border border-black/[0.06] bg-white p-6 shadow-[0_8px_30px_-16px_rgba(0,0,0,0.12)]">
              <h2 className="text-sm font-semibold tracking-tight text-[#1d1d1f]">Configurações do tenant</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#6e6e73]">
                Marca, horários de funcionamento, taxa de entrega e integrações (Supabase, WhatsApp
                Business, etc.) ficam centralizados aqui. Os dados exibidos na barra lateral e na
                esteira devem refletir o registro carregado do backend por{" "}
                <code className="rounded-md bg-[#f5f5f7] px-1.5 py-0.5 font-mono text-xs text-[#424245]">slug</code>{" "}
                ou sessão autenticada.
              </p>
              <dl className="mt-6 grid gap-3 text-sm text-[#424245] sm:grid-cols-2">
                <div className="rounded-xl border border-black/[0.06] bg-[#fafafa] p-4">
                  <dt className="text-xs font-medium uppercase tracking-wide text-[#86868b]">WhatsApp cadastro</dt>
                  <dd className="mt-1 font-medium text-[#1d1d1f]">{restaurante.whatsapp}</dd>
                </div>
                <div className="rounded-xl border border-black/[0.06] bg-[#fafafa] p-4">
                  <dt className="text-xs font-medium uppercase tracking-wide text-[#86868b]">Cor do tema</dt>
                  <dd className="mt-1 flex items-center gap-2 font-medium text-[#1d1d1f]">
                    <span
                      className="h-4 w-4 rounded-full ring-2 ring-black/[0.06]"
                      style={{ backgroundColor: restaurante.cor_tema }}
                    />
                    {restaurante.cor_tema}
                  </dd>
                </div>
              </dl>
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
