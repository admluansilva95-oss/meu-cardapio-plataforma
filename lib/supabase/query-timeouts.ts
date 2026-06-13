/**
 * Timeouts explícitos para chamadas PostgREST (Supabase).
 * Evita que Route Handlers fiquem pendurados se a API ou a rede falharem.
 */
export const SUPABASE_PUBLIC_CARDAPIO_TIMEOUT_MS = 12_000;
export const SUPABASE_SERVER_WRITE_TIMEOUT_MS = 18_000;

export function supabaseQuerySignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

/** Erros típicos quando `AbortSignal.timeout` cancela o fetch do PostgREST. */
export function isSupabaseQueryTimeoutLike(err: { message?: string; name?: string } | null): boolean {
  if (!err) return false;
  const m = (err.message ?? "") + (err.name ?? "");
  return /aborted|timeout|AbortError/i.test(m);
}
