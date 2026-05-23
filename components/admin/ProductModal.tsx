"use client";

import { useEffect, useMemo, useState } from "react";
import type { Prato, PratoStatus } from "../../types";

export type ProductModalMode = "create" | "edit";

export interface ProductModalProps {
  open: boolean;
  mode: ProductModalMode;
  restauranteId: string;
  /** Em modo `edit`, o prato atual; em `create`, null */
  initialPrato: Prato | null;
  onClose: () => void;
  /** O pai aplica insert/update no Supabase e atualiza a lista */
  onSubmit: (payload: {
    id?: string;
    restaurante_id: string;
    nome: string;
    preco: number;
    descricao: string | null;
    status: PratoStatus;
  }) => void | Promise<void>;
}

const emptyForm = {
  nome: "",
  preco: "",
  descricao: "",
  status: "ativo" as PratoStatus,
};

export function ProductModal({
  open,
  mode,
  restauranteId,
  initialPrato,
  onClose,
  onSubmit,
}: ProductModalProps) {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const title = useMemo(
    () => (mode === "create" ? "Novo prato" : "Editar prato"),
    [mode],
  );

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initialPrato) {
      setForm({
        nome: initialPrato.nome,
        preco: String(initialPrato.preco).replace(".", ","),
        descricao: initialPrato.descricao ?? "",
        status: initialPrato.status,
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, mode, initialPrato]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const precoNormalizado = Number(
      form.preco.replace(/\s/g, "").replace(",", "."),
    );
    if (!form.nome.trim() || Number.isNaN(precoNormalizado) || precoNormalizado < 0) {
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        id: mode === "edit" && initialPrato ? initialPrato.id : undefined,
        restaurante_id: restauranteId,
        nome: form.nome.trim(),
        preco: precoNormalizado,
        descricao: form.descricao.trim() ? form.descricao.trim() : null,
        status: form.status,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-modal-title"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-900/20">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 id="product-modal-title" className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Campos alinhados ao modelo que você persistir no Supabase.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fechar"
          >
            <span aria-hidden className="text-lg leading-none">
              ×
            </span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          <div className="space-y-2">
            <label htmlFor="nome" className="text-sm font-medium text-slate-700">
              Nome
            </label>
            <input
              id="nome"
              name="nome"
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm text-slate-900 outline-none ring-teal-500/30 transition focus:border-teal-500 focus:bg-white focus:ring-4"
              placeholder="Ex.: Bowl mediterrâneo"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="preco" className="text-sm font-medium text-slate-700">
                Preço (R$)
              </label>
              <input
                id="preco"
                name="preco"
                inputMode="decimal"
                value={form.preco}
                onChange={(e) => setForm((f) => ({ ...f, preco: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm text-slate-900 outline-none ring-teal-500/30 transition focus:border-teal-500 focus:bg-white focus:ring-4"
                placeholder="24,90"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="status" className="text-sm font-medium text-slate-700">
                Status
              </label>
              <select
                id="status"
                name="status"
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as PratoStatus }))
                }
                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm text-slate-900 outline-none ring-teal-500/30 transition focus:border-teal-500 focus:bg-white focus:ring-4"
              >
                <option value="ativo">Ativo</option>
                <option value="pausado">Pausado</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="descricao" className="text-sm font-medium text-slate-700">
              Descrição
            </label>
            <textarea
              id="descricao"
              name="descricao"
              rows={3}
              value={form.descricao}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm text-slate-900 outline-none ring-teal-500/30 transition focus:border-teal-500 focus:bg-white focus:ring-4"
              placeholder="Ingredientes, tamanho, observações para o cliente…"
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-slate-900/20 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Salvando…" : mode === "create" ? "Adicionar" : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
