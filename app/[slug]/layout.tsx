import type { ReactNode } from "react";

/** Evita HTML estático com dados de cardápio desatualizados (segmento dinâmico). */
export const dynamic = "force-dynamic";

export default function PublicCardapioSlugLayout({ children }: { children: ReactNode }) {
  return children;
}
