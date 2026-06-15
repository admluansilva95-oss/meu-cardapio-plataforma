/**
 * Extrai texto útil de erros vindos do cliente Supabase (PostgREST, Storage, Auth),
 * incluindo quando `message` vem como JSON em string ou o corpo de erro não é JSON.
 */
export function coalesceSupabaseErrorMessage(err: unknown): string {
  if (err == null) return "";
  if (typeof err === "string") return unwrapJsonLikeMessage(err);
  if (err instanceof Error) return unwrapJsonLikeMessage(err.message);

  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const base =
      typeof o.message === "string"
        ? unwrapJsonLikeMessage(o.message)
        : typeof o.error === "string"
          ? unwrapJsonLikeMessage(o.error)
          : "";

    const details = typeof o.details === "string" ? o.details.trim() : "";
    const hint = typeof o.hint === "string" ? o.hint.trim() : "";
    const code = typeof o.code === "string" ? o.code.trim() : "";

    const parts: string[] = [];
    if (base) parts.push(base);
    if (details && !base.includes(details)) parts.push(details);
    if (hint && !parts.some((p) => p.includes(hint))) parts.push(`Sugestão: ${hint}`);
    if (parts.length > 0) return parts.join(" — ");

    if (code) return `${code} (sem mensagem detalhada do servidor).`;
  }

  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function unwrapJsonLikeMessage(s: string): string {
  const t = s.trim();
  if (!t.startsWith("{")) return s;

  try {
    const j = JSON.parse(t) as Record<string, unknown>;
    if (typeof j.message === "string") return j.message;
    if (typeof j.msg === "string") return j.msg;
    if (typeof j.error === "string") return j.error;
    if (typeof j.error_description === "string") return j.error_description;
    if (j.error && typeof j.error === "object") {
      const nested = j.error as Record<string, unknown>;
      if (typeof nested.message === "string") return nested.message;
    }
  } catch {
    /* manter string original */
  }
  return s;
}
