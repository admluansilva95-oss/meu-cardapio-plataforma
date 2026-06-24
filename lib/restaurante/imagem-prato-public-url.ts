import { getPublicSupabaseProjectUrl } from "@/lib/supabase/normalize-public-supabase-url";

export const BUCKET_IMAGENS_PRATOS = "imagens-pratos" as const;

const PUBLIC_OBJECT_PREFIX = `/storage/v1/object/public/${BUCKET_IMAGENS_PRATOS}/`;

/** Evita gravar string literal "undefined"/"null" ou vazia na coluna `imagem`. */
export function imagemUrlSeguraParaColuna(url: string | null | undefined): string | null {
  if (url == null) return null;
  const t = String(url).trim();
  if (!t || t === "undefined" || t === "null") return null;
  return t;
}

/**
 * Garante URL pública absoluta no bucket `imagens-pratos`, alinhada ao projeto Supabase atual.
 * Corrige URLs salvas com host antigo/errado ou caminho relativo dentro do bucket.
 */
export function resolveImagemPratoPublicUrl(stored: string | null | undefined): string | null {
  const safe = imagemUrlSeguraParaColuna(stored);
  if (!safe) return null;

  const projectUrl = getPublicSupabaseProjectUrl();
  const markerIdx = safe.indexOf(PUBLIC_OBJECT_PREFIX);

  if (markerIdx >= 0) {
    const objectPath = safe.slice(markerIdx + PUBLIC_OBJECT_PREFIX.length).replace(/^\/+/, "");
    if (projectUrl) {
      return `${projectUrl}${PUBLIC_OBJECT_PREFIX}${objectPath}`;
    }
    return safe;
  }

  if (!safe.startsWith("http://") && !safe.startsWith("https://") && projectUrl) {
    const objectPath = safe.replace(/^\/+/, "");
    return `${projectUrl}${PUBLIC_OBJECT_PREFIX}${objectPath}`;
  }

  return safe;
}
