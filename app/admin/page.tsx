"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Prato, PratoStatus, Restaurante } from "../../types";
import { createBrowserSupabaseClient } from "@/lib/supabase";

const TENANT_SLUG = "casa-do-sabor";

type AdminTab = "pedidos" | "cardapio" | "configuracoes";
type KanbanCol = "recebidos" | "cozinha" | "pronto";
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
  return v === "recebidos" || v === "cozinha" || v === "pronto";
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
    nome: row.nome,
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
  return null;
}

function mensagemParaColuna(p: Pedido, destino: KanbanCol): string {
  if (destino === "cozinha") {
    return `Olá ${p.cliente}, seu pedido entrou em preparo!`;
  }
  return `Olá ${p.cliente}, seu pedido está pronto e já saiu para entrega com o motoboy ${p.motoboy}. Obrigado pela preferência!`;
}

const DRAG_MIME = "application/x-meu-cardapio-pedido-id";

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
    <aside className="flex w-full shrink-0 flex-col border-b border-white/10 bg-zinc-950/70 backdrop-blur-xl lg:h-screen lg:w-64 lg:border-b-0 lg:border-r">
      <div className="border-b border-white/10 px-5 py-6">
        <div className="flex items-center gap-3">
          <div
            className="grid h-10 w-10 place-items-center rounded-2xl text-sm font-bold text-white shadow-inner shadow-black/30"
            style={{ background: `linear-gradient(135deg, ${restaurante.cor_tema}, #0f172a)` }}
          >
            {restaurante.nome.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{restaurante.nome}</p>
            <p className="truncate text-xs text-zinc-500">Painel admin</p>
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
                "flex min-w-[8.5rem] flex-col rounded-2xl px-3 py-2.5 text-left transition lg:min-w-0",
                active
                  ? "bg-white/10 text-white ring-1 ring-white/15"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
              ].join(" ")}
            >
              <span className="text-sm font-semibold">{it.label}</span>
              <span className="text-[11px] text-zinc-500">{it.hint}</span>
            </button>
          );
        })}
      </nav>
      <div className="hidden border-t border-white/10 p-4 text-[11px] text-zinc-600 lg:block">
        Slug: <span className="font-mono text-zinc-400">{restaurante.slug}</span>
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
      className="cursor-grab rounded-2xl border border-white/10 bg-zinc-900/55 p-4 shadow-[0_18px_50px_-40px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.04] transition hover:border-teal-400/25 hover:ring-teal-500/20 active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-300/90">
            {formatPedidoId(pedido.id)}
          </p>
          <h3 className="mt-1 text-sm font-semibold text-white">{pedido.cliente}</h3>
          <p className="mt-0.5 text-xs text-zinc-400">{pedido.telefone}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-2 py-1 text-[10px] font-medium text-zinc-600 transition hover:bg-red-500/10 hover:text-red-300"
        >
          Cancelar
        </button>
      </div>
      <ul className="mt-3 space-y-1 border-t border-white/5 pt-3 text-xs text-zinc-300">
        {pedido.itens.map((line, idx) => (
          <li key={`${pedido.id}-${idx}-${line}`} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-teal-400/80" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-400">
        <span className="rounded-full bg-white/5 px-2 py-0.5 font-medium text-zinc-200">
          Total {formatBRL(pedido.total)}
        </span>
        <span className="rounded-full bg-white/5 px-2 py-0.5">{pedido.pagamento}</span>
        <span className="rounded-full bg-white/5 px-2 py-0.5">Motoboy: {pedido.motoboy}</span>
      </div>
      {pedido.observacoes ? (
        <p className="mt-2 rounded-xl bg-black/30 px-3 py-2 text-[11px] leading-relaxed text-zinc-400">
          <span className="font-semibold text-zinc-500">Obs.</span> {pedido.observacoes}
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-2">
        {canAdvance ? (
          <button
            type="button"
            onClick={onAdvance}
            className="w-full rounded-xl bg-gradient-to-r from-teal-400 to-emerald-400 px-3 py-2 text-xs font-semibold text-zinc-950 shadow-lg shadow-teal-500/20 transition hover:brightness-105 active:scale-[0.99]"
          >
            Avançar status + WhatsApp
          </button>
        ) : (
          <p className="rounded-xl border border-dashed border-white/10 px-3 py-2 text-center text-[11px] text-zinc-500">
            Pedido na etapa final da esteira.
          </p>
        )}
        <button
          type="button"
          onClick={onEdit}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-white/10"
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950 p-6 shadow-2xl shadow-black/60"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-300/90">
              Editar pedido
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              {formatPedidoId(pedido.id)} · {pedido.cliente}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-2 py-1 text-xs text-zinc-400 hover:bg-white/5"
          >
            Fechar
          </button>
        </div>
        <div className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400" htmlFor="motoboy">
              Nome do motoboy
            </label>
            <input
              id="motoboy"
              value={motoboy}
              onChange={(e) => setMotoboy(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-teal-400/40 focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400" htmlFor="pagamento">
              Forma de pagamento
            </label>
            <select
              id="pagamento"
              value={pagamento}
              onChange={(e) => setPagamento(e.target.value as FormaPagamento)}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-teal-400/40 focus:ring-2 focus:ring-teal-500/20"
            >
              <option value="Pix">Pix</option>
              <option value="Cartão">Cartão</option>
              <option value="Dinheiro">Dinheiro</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400" htmlFor="obs-extra">
              Observação de última hora
            </label>
            <textarea
              id="obs-extra"
              rows={3}
              value={obsExtra}
              onChange={(e) => setObsExtra(e.target.value)}
              placeholder='Ex.: "Trocar refrigerante"'
              className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-teal-400/40 focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/5"
          >
            Descartar
          </button>
          <button
            type="button"
            onClick={() => onSave({ motoboy, pagamento, observacaoExtra: obsExtra })}
            className="rounded-xl bg-teal-400 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-teal-300"
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-white">
          {mode === "create" ? "Novo prato" : "Editar prato"}
        </h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Nome</label>
            <input
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Preço (R$)</label>
            <input
              value={form.preco}
              onChange={(e) => setForm((f) => ({ ...f, preco: e.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Descrição</label>
            <textarea
              value={form.descricao}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
              rows={3}
              className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-400" htmlFor="prato-imagem-arquivo">
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
              className="block w-full text-xs text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-zinc-200 hover:file:bg-white/15"
            />
            {mode === "edit" && initial?.imagem && !arquivoImagem ? (
              <p className="text-[11px] text-zinc-500">
                Imagem atual no cardápio. Envie um arquivo acima para substituir.
              </p>
            ) : null}
            {arquivoImagem ? (
              <p className="truncate text-[11px] text-zinc-400" title={arquivoImagem.name}>
                Selecionado: {arquivoImagem.name}
              </p>
            ) : null}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PratoStatus }))}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
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
              className="rounded-xl border border-white/10 px-4 py-2 text-xs text-zinc-300 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-teal-400 px-4 py-2 text-xs font-semibold text-zinc-950 disabled:opacity-50"
            >
              {submitting ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

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
    setLoading(true);
    setFetchError(null);
    try {
      const { data: restRow, error: restErr } = await supabase
        .from("restaurantes")
        .select("id, nome, slug, whatsapp, logo, cor_tema")
        .eq("slug", TENANT_SLUG)
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
          `Nenhum restaurante com slug "${TENANT_SLUG}" no Supabase. Crie o registro ou rode o seed do schema.`,
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
            .select("id, restaurante_id, nome, preco, descricao, imagem, status")
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
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const porColuna = useMemo(() => {
    const map: Record<KanbanCol, Pedido[]> = {
      recebidos: [],
      cozinha: [],
      pronto: [],
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

    const msg = mensagemParaColuna({ ...atual, coluna: destino }, destino);
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
          status: payload.status,
          imagem: imagemFinal,
        })
        .select("id, restaurante_id, nome, preco, descricao, imagem, status")
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
    { id: "recebidos", title: "Recebidos 📥", accent: "from-sky-500/25 to-transparent" },
    { id: "cozinha", title: "Na Cozinha 🍳", accent: "from-amber-400/25 to-transparent" },
    {
      id: "pronto",
      title: "Pronto / Saiu para Entrega 🛵",
      accent: "from-emerald-400/25 to-transparent",
    },
  ];

  if (loading && !restaurante) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050508] text-zinc-400">
        <p className="text-sm">Carregando painel…</p>
      </div>
    );
  }

  if (!restaurante) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#050508] px-6 text-center text-zinc-300">
        <p className="max-w-md text-sm leading-relaxed text-zinc-400">{fetchError}</p>
        <button
          type="button"
          onClick={() => void loadData()}
          className="rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-white hover:bg-white/5"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#050508] text-zinc-100">
      <AdminSidebar restaurante={restaurante} tab={tab} onTab={setTab} />

      <main className="flex min-h-0 flex-1 flex-col">
        <header className="border-b border-white/10 bg-zinc-950/80 px-5 py-5 backdrop-blur-xl sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-white">
                {tab === "pedidos"
                  ? "Esteira de pedidos"
                  : tab === "cardapio"
                    ? "Cardápio"
                    : "Configurações"}
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                Tenant: <span className="font-medium text-zinc-300">{restaurante.nome}</span>
                {loading ? (
                  <span className="ml-2 text-xs text-zinc-600">· sincronizando…</span>
                ) : null}
              </p>
            </div>
            {tab === "cardapio" ? (
              <button
                type="button"
                onClick={openCreatePrato}
                className="inline-flex items-center justify-center rounded-2xl bg-teal-400 px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-teal-500/25 transition hover:bg-teal-300"
              >
                Novo prato
              </button>
            ) : null}
          </div>
        </header>

        {fetchError ? (
          <div className="border-b border-amber-500/20 bg-amber-500/10 px-5 py-3 text-sm text-amber-100 sm:px-8">
            {fetchError}
            <button
              type="button"
              className="ml-3 text-xs font-semibold underline"
              onClick={() => setFetchError(null)}
            >
              dispensar
            </button>
          </div>
        ) : null}

        <div className="flex-1 overflow-auto px-4 py-6 sm:px-8">
          {tab === "pedidos" ? (
            <div className="grid gap-5 lg:grid-cols-3">
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
                    "flex min-h-[420px] flex-col rounded-3xl border bg-gradient-to-b from-white/[0.04] to-transparent p-4 shadow-inner shadow-black/40 transition",
                    dragOverCol === col.id
                      ? "border-teal-400/50 ring-2 ring-teal-500/25"
                      : "border-white/10",
                  ].join(" ")}
                >
                  <div
                    className={`mb-4 rounded-2xl bg-gradient-to-r ${col.accent} px-3 py-3 ring-1 ring-white/10`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold text-white">{col.title}</h2>
                      <span className="rounded-full bg-black/40 px-2 py-0.5 text-[11px] text-zinc-400">
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
                      <p className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-xs text-zinc-500">
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
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/60 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-white">Pratos</h2>
                  <p className="text-xs text-zinc-500">
                    Dados ao vivo do Supabase (slug <span className="font-mono">{TENANT_SLUG}</span>
                    ).
                  </p>
                </div>
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-zinc-400">
                  {pratosRows.length} {pratosRows.length === 1 ? "item" : "itens"}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                  <thead className="bg-white/[0.03] text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-5 py-3">Nome</th>
                      <th className="px-5 py-3">Preço</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {pratosRows.map((prato) => (
                      <tr key={prato.id} className="hover:bg-white/[0.02]">
                        <td className="px-5 py-3">
                          <div className="font-medium text-white">{prato.nome}</div>
                          {prato.descricao ? (
                            <div className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
                              {prato.descricao}
                            </div>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-zinc-300">
                          {formatBRL(prato.preco)}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={[
                              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                              prato.status === "ativo"
                                ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20"
                                : "bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/20",
                            ].join(" ")}
                          >
                            {prato.status === "ativo" ? "Ativo" : "Pausado"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openEditPrato(prato)}
                            className="mr-2 rounded-lg px-2 py-1 text-xs font-semibold text-teal-300 hover:bg-teal-500/10"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeletePrato(prato)}
                            className="rounded-lg px-2 py-1 text-xs font-semibold text-red-300 hover:bg-red-500/10"
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
            <section className="max-w-2xl rounded-3xl border border-white/10 bg-zinc-950/60 p-6 shadow-xl">
              <h2 className="text-sm font-semibold text-white">Configurações do tenant</h2>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                Marca, horários de funcionamento, taxa de entrega e integrações (Supabase, WhatsApp
                Business, etc.) ficam centralizados aqui. Os dados exibidos na barra lateral e na
                esteira devem refletir o registro carregado do backend por{" "}
                <code className="rounded bg-white/5 px-1 font-mono text-xs text-zinc-300">slug</code>{" "}
                ou sessão autenticada.
              </p>
              <dl className="mt-6 grid gap-3 text-sm text-zinc-400 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">WhatsApp cadastro</dt>
                  <dd className="mt-1 font-medium text-zinc-200">{restaurante.whatsapp}</dd>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">Cor do tema</dt>
                  <dd className="mt-1 flex items-center gap-2 font-medium text-zinc-200">
                    <span
                      className="h-4 w-4 rounded-full ring-2 ring-white/20"
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
