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
        <p className="mt-1 text-sm text-zinc-500">
          Aparece no topo do cardápio público. JPG, PNG ou WebP até 2&nbsp;MB. Salve as alterações no fim da página
          para enviar ao servidor.
        </p>
      </div>

      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
          className={[
            "group relative flex h-36 w-full max-w-sm flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center transition hover:border-zinc-300 hover:bg-zinc-50/80 sm:h-32 sm:max-w-xs",
            disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          ].join(" ")}
        >
          {displayUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displayUrl}
                alt=""
                className="pointer-events-none max-h-24 max-w-[85%] rounded-xl border border-zinc-100 object-contain shadow-sm"
              />
              <span className="text-xs font-medium text-zinc-500">
                {hasPendingFile ? "Nova imagem — clique para trocar" : "Clique para substituir"}
              </span>
            </>
          ) : (
            <>
              <span className="text-2xl text-zinc-300 transition group-hover:text-zinc-400" aria-hidden>
                +
              </span>
              <span className="text-sm font-semibold text-zinc-700">Enviar logo ou foto</span>
              <span className="text-xs text-zinc-500">Arraste ou clique para escolher</span>
            </>
          )}
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
