"use client";

import { useRef } from "react";

const MAX_BYTES = 2 * 1024 * 1024;

export function RestauranteLogoUploadField(props: {
  displayUrl: string | null;
  hasPendingFile: boolean;
  disabled?: boolean;
  onSelectFile: (file: File) => void;
  onClear: () => void;
}) {
  const { displayUrl, hasPendingFile, disabled, onSelectFile, onClear } = props;
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Logo do estabelecimento</p>
        <p className="mt-1 text-sm font-normal leading-relaxed text-zinc-500">
          Aparece no topo do cardápio público. JPG, PNG ou WebP até 2&nbsp;MB. Salve no fim da página para enviar ao
          servidor.
        </p>
      </div>

      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
          className={[
            "group relative flex w-full max-w-[11rem] flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 transition hover:border-zinc-300 hover:bg-zinc-50/90",
            disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          ].join(" ")}
        >
          <div className="aspect-square w-full">
            {displayUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={displayUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-3 py-6 text-center">
                <span className="text-2xl font-light text-zinc-300 transition group-hover:text-zinc-400" aria-hidden>
                  +
                </span>
                <span className="text-xs font-semibold text-zinc-600">Logo</span>
              </div>
            )}
          </div>
          {displayUrl ? (
            <span className="border-t border-zinc-100 bg-white/90 px-2 py-1.5 text-[10px] font-medium text-zinc-500">
              {hasPendingFile ? "Nova — toque para trocar" : "Toque para substituir"}
            </span>
          ) : null}
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (f.size > MAX_BYTES) {
              window.alert("A imagem deve ter no máximo 2 MB. Escolha um arquivo menor.");
              return;
            }
            onSelectFile(f);
          }}
        />

        {displayUrl ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onClear}
            className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Remover logo
          </button>
        ) : null}
      </div>
    </div>
  );
}
