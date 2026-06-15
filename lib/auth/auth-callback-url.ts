import { getPublicAppUrl } from "@/lib/site-url";

/**
 * URL absoluta enviada ao Supabase em `signUp({ options: { emailRedirectTo } })`.
 * Garante origem sem barra final e `next` codificado uma vez (evita barras duplas e URLs ilegíveis).
 */
export function buildEmailAuthRedirectTo(nextInternalPath: string): string {
  const origin = getPublicAppUrl().replace(/\/+$/, "");
  const path = nextInternalPath.startsWith("/") ? nextInternalPath : `/${nextInternalPath}`;
  return `${origin}/auth/callback?next=${encodeURIComponent(path)}`;
}
