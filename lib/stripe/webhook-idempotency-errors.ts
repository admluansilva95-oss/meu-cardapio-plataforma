/**
 * Indica se o erro do Supabase/PostgREST é compatível com “tabela inexistente”
 * (webhook segue sem trava de idempotência até o DDL existir no banco).
 *
 * Critérios:
 * - Código Postgres `42P01` (undefined_table)
 * - Código PostgREST `PGRST205` (objeto fora do schema cache)
 * - Texto contendo `relation does not exist` (mensagem típica do Postgres em inglês)
 */
export function isStripeIdempotencyTableUnavailable(err: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
} | null): boolean {
  if (!err) return false;
  const code = String(err.code ?? "").toUpperCase();
  const msg = (err.message ?? "").toLowerCase();
  const details = (err.details ?? "").toLowerCase();
  const hint = (err.hint ?? "").toLowerCase();
  const blob = `${msg} ${details} ${hint}`;

  if (code === "42P01") return true;
  if (code === "PGRST205") return true;
  if (blob.includes("relation does not exist")) return true;
  if (blob.includes("pgrst205")) return true;
  if (blob.includes("schema cache") && blob.includes("stripe_processed_events")) return true;
  if (blob.includes("stripe_processed_events") && blob.includes("does not exist")) return true;
  if (blob.includes("relation") && blob.includes("stripe_processed_events") && blob.includes("does not exist")) {
    return true;
  }
  return false;
}
