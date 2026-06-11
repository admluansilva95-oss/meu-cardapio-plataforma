/**
 * Detecta “tabela inexistente” / objeto fora do schema cache (PostgREST + Postgres).
 * Nesses casos o webhook segue sem trava de idempotência até a migração ser aplicada.
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
  if (blob.includes("pgrst205")) return true;
  if (blob.includes("schema cache") && blob.includes("stripe_processed_events")) return true;
  if (blob.includes("stripe_processed_events") && blob.includes("does not exist")) return true;
  if (blob.includes("relation") && blob.includes("stripe_processed_events") && blob.includes("does not exist")) {
    return true;
  }
  return false;
}
