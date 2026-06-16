import { Fragment } from "react";

const DEFAULT_METADATA = ["Retirada na loja", "Cobertura: 3 bairros", "Seg a Dom, 19h às 23h"] as const;

export type CardapioHeroAppleProps = {
  titulo?: string;
  subtitulo?: string;
  /** Partes da linha de metadata, na ordem, separadas por "•". */
  metadataItens?: readonly string[];
};

const fontDisplay =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const fontText =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, sans-serif';

const fontMeta =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif';

/**
 * Cabeçalho de vitrine estilo Apple: tipografia limpa, hierarquia clara, muito espaço em branco.
 */
export function CardapioHeroApple({
  titulo = "Espeto & Cia.",
  subtitulo = "Escolha seus favoritos.",
  metadataItens = DEFAULT_METADATA,
}: CardapioHeroAppleProps) {
  return (
    <header className="mx-auto max-w-2xl px-6 py-16 text-center sm:px-8 sm:py-20">
      <h1
        className="font-sans text-[2rem] font-bold leading-[1.08] tracking-[-0.03em] text-zinc-950 sm:text-[2.5rem] sm:leading-[1.06]"
        style={{ fontFamily: fontDisplay }}
      >
        {titulo}
      </h1>

      <p
        className="mt-3 font-sans text-[1.0625rem] font-normal leading-relaxed tracking-[-0.01em] text-zinc-500 sm:mt-4 sm:text-lg"
        style={{ fontFamily: fontText }}
      >
        {subtitulo}
      </p>

      {metadataItens.length > 0 ? (
        <p
          className="mx-auto mt-6 max-w-lg font-sans text-sm font-normal leading-relaxed tracking-[-0.006em] text-slate-500 sm:mt-7 sm:text-[0.9375rem]"
          style={{ fontFamily: fontMeta }}
        >
          {metadataItens.map((item, i) => (
            <Fragment key={`${i}-${item}`}>
              {i > 0 ? (
                <span className="mx-2.5 inline-block text-slate-300 sm:mx-3" aria-hidden>
                  •
                </span>
              ) : null}
              <span className="whitespace-nowrap">{item}</span>
            </Fragment>
          ))}
        </p>
      ) : null}
    </header>
  );
}
