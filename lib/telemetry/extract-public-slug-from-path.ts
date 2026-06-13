const RESERVED_FIRST_SEGMENTS = new Set([
  "admin",
  "login",
  "cadastro",
  "assinar",
  "auth",
  "api",
  "_next",
]);

/**
 * Primeiro segmento de caminho público de vitrine (`/{slug}`), ou null se for rota reservada.
 */
export function extractPublicSlugFromPathname(pathname: string): string | null {
  if (!pathname || pathname === "/") return null;
  const first = pathname.split("/").filter(Boolean)[0];
  if (!first) return null;
  if (RESERVED_FIRST_SEGMENTS.has(first.toLowerCase())) return null;
  return first;
}
