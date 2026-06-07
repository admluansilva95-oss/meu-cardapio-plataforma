"use client";

import { useState } from "react";

export function CategoriaPratoField(props: {
  value: string;
  onChange: (categoria: string) => void;
  opcoes: string[];
  onNovaCategoria: (nome: string) => Promise<void>;
  disabled?: boolean;
}) {
  const { value, onChange, opcoes, onNovaCategoria, disabled } = props;
  const [modalOpen, setModalOpen] = useState(false);
  const [nova, setNova] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sorted = [...opcoes].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const merged = [...new Set([...sorted, "Cardápio"])].filter(Boolean);

  const fechar = () => {
    setModalOpen(false);
    setNova("");
    setErr(null);
  };

  const salvarNova = async () => {
    const t = nova.trim();
    if (t.length < 2) {
      setErr("Use ao menos 2 caracteres.");
      return;
    }
    if (t.length > 48) {
      setErr("Máximo 48 caracteres.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onNovaCategoria(t);
      onChange(t);
      fechar();
    } catch {
      setErr("Não foi possível salvar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Categoria</label>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setModalOpen(true)}
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-zinc-600 underline-offset-2 transition hover:text-zinc-900 hover:underline disabled:opacity-40"
        >
          + Criar nova categoria
        </button>
      </div>
      <select
        value={value || "Cardápio"}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-2xl border border-zinc-200 bg-zinc-50/50 px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-zinc-900 disabled:opacity-50"
      >
        {merged.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Agrupa o prato na vitrine pública. &quot;Cardápio&quot; é a seção padrão.
      </p>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30 p-4 backdrop-blur-sm sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) fechar();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-3xl border border-zinc-100 bg-white p-6 shadow-xl"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Nova categoria</p>
            <h3 className="mt-1 text-lg font-semibold tracking-tight text-zinc-900">Nome da seção</h3>
            <input
              autoFocus
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              placeholder="Ex.: Hambúrgueres"
              className="mt-4 w-full rounded-2xl border border-zinc-200 bg-zinc-50/50 px-4 py-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-900"
            />
            {err ? (
              <p className="mt-2 text-xs font-medium text-red-600" role="alert">
                {err}
              </p>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={fechar}
                className="rounded-full px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void salvarNova()}
                className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50"
              >
                {busy ? "Salvando…" : "Adicionar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
