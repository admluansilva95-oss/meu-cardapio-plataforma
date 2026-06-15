/**
 * URL base do projeto em Supabase → **Settings** → **API** → *Project URL*
 * (ex.: `https://abcdxyz.supabase.co`), **sem** barra final e **sem** sufixos de API.
 *
 * Quando alguém cola por engano `.../auth/v1`, `.../rest/v1`, etc., o GoTrue/PostgREST
 * responde com erros do tipo “Invalid path specified in request URL”.
 */
export function normalizePublicSupabaseUrl(raw: string | undefined | null): string {
  let u = String(raw ?? "").trim();
  if (!u) return "";
  const suffixes = [
    "/auth/v1",
    "/rest/v1",
    "/storage/v1",
    "/realtime/v1",
    "/functions/v1",
    "/graphql/v1",
  ];
  let guard = 0;
  while (guard++ < 8) {
    u = u.replace(/\/+$/, "");
    const lower = u.toLowerCase();
    let stripped = false;
    for (const suf of suffixes) {
      if (lower.endsWith(suf)) {
        u = u.slice(0, -suf.length);
        stripped = true;
        break;
      }
    }
    if (!stripped) break;
  }
  return u.replace(/\/+$/, "");
}

/** URL pública normalizada para `createBrowserClient` / comparações no cliente. */
export function getPublicSupabaseProjectUrl(): string {
  return normalizePublicSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
}
