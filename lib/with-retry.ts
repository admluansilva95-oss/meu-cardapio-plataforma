function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Erros comuns de rede / limite / indisponibilidade transitória do PostgREST ou fetch. */
export function isRetryableSupabaseError(error: unknown): boolean {
  if (error == null) return false;
  if (typeof error !== "object") return false;
  const e = error as { message?: string; code?: string; status?: number };
  const msg = (e.message ?? "").toLowerCase();
  const code = String(e.code ?? "");
  const status = typeof e.status === "number" ? e.status : NaN;

  if (status === 429 || status === 502 || status === 503 || status === 504) return true;
  if (["503", "504", "429", "pgrst301", "57014"].includes(code.toLowerCase())) return true;

  const hints = [
    "fetch",
    "network",
    "failed to fetch",
    "timeout",
    "timed out",
    "rate limit",
    "too many requests",
    "temporarily unavailable",
    "bad gateway",
    "service unavailable",
    "gateway",
  ];
  return hints.some((h) => msg.includes(h));
}

type WithRetryOptions<T> = {
  maxAttempts?: number;
  baseDelayMs?: number;
  /** Quando retornar true, agenda nova tentativa (após backoff) até esgotar maxAttempts. */
  shouldRetry?: (result: T) => boolean;
};

/**
 * Executa `fn` com backoff exponencial entre tentativas.
 * Útil para leituras Supabase sujeitas a gargalos ou rate limit transitório.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: WithRetryOptions<T>,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 4;
  const baseDelayMs = options?.baseDelayMs ?? 250;
  const shouldRetry = options?.shouldRetry;

  let last: T | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await fn();
    if (!shouldRetry?.(last)) {
      return last;
    }
    if (attempt < maxAttempts) {
      await delay(baseDelayMs * 2 ** (attempt - 1));
    }
  }
  return last as T;
}
