import type { AuthError, SupabaseClient } from "@supabase/supabase-js";

/** Variáveis públicas necessárias ao cliente Supabase no browser. */
export function isSupabaseBrowserEnvConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}

export const MENSAGEM_SUPABASE_ENV_AUSENTE =
  "Este ambiente não tem as credenciais públicas do Supabase. Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no painel de deploy e faça um novo deploy.";

function syntheticAuthError(message: string, status = 400): AuthError {
  return {
    message,
    name: "AuthError",
    status,
  } as AuthError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Erros em que **repetir o mesmo pedido** pode ajudar (rede / cold start / TLS).
 * Nunca incluir credenciais inválidas, quotas de utilizador ou políticas de confirmação.
 */
function shouldRetrySupabaseAuthWireError(err: AuthError | null | undefined): boolean {
  if (!err?.message) return false;
  const m = err.message.toLowerCase();
  if (
    m.includes("invalid login") ||
    m.includes("invalid_grant") ||
    m.includes("invalid credentials") ||
    m.includes("email not confirmed") ||
    m.includes("confirm your email") ||
    m.includes("user already registered") ||
    m.includes("already been registered") ||
    m.includes("already registered") ||
    m.includes("signup_disabled") ||
    m.includes("email address is invalid")
  ) {
    return false;
  }
  const st = (err as { status?: number }).status;
  if (st === 0) return true;
  if (st === 429) return true;
  if (st === 408) return true;
  return (
    m.includes("failed to fetch") ||
    m.includes("fetch failed") ||
    m.includes("networkerror") ||
    m.includes("network request failed") ||
    m.includes("load failed") ||
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("econnreset") ||
    m.includes("socket hang") ||
    m.includes("temporarily unavailable") ||
    m.includes("bad gateway") ||
    m.includes("gateway timeout") ||
    m.includes("service unavailable")
  );
}

async function runAuthCallWithWireRetries<T extends { error: AuthError | null }>(
  label: "signIn" | "signUp",
  fn: () => Promise<T>,
): Promise<T> {
  const maxAttempts = 4;
  let last: T | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      last = await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      last = {
        error: syntheticAuthError(msg || `${label}_failed`, 0),
      } as T;
    }
    if (!last.error || !shouldRetrySupabaseAuthWireError(last.error)) {
      return last;
    }
    if (attempt < maxAttempts - 1) {
      await sleep(Math.min(5000, 400 * 2 ** attempt));
    }
  }
  return last as T;
}

export async function authGetSessionSafe(
  supabase: SupabaseClient,
): Promise<Awaited<ReturnType<SupabaseClient["auth"]["getSession"]>>> {
  try {
    return await supabase.auth.getSession();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      data: { session: null },
      error: syntheticAuthError(msg || "get_session_failed", 0),
    };
  }
}

/**
 * Garante que `getSession()` vê a sessão persistida (cookies / storage) após `signInWithPassword`.
 * Evita navegação client-side imediata antes do runtime gravar o estado — o `proxy` no próximo documento
 * precisa dos cookies.
 */
export async function waitForOwnerSessionAfterSignIn(
  supabase: SupabaseClient,
  opts?: { maxMs?: number; intervalMs?: number },
): Promise<boolean> {
  const maxMs = opts?.maxMs ?? 8000;
  const intervalMs = opts?.intervalMs ?? 40;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const { data, error } = await authGetSessionSafe(supabase);
    if (!error && data.session?.access_token && data.session.user) {
      return true;
    }
    await sleep(intervalMs);
  }
  return false;
}

/**
 * `signInWithPassword` com retries só em falhas de **rede** / timeout; credenciais erradas não repetem.
 * Exceções do SDK normalizam-se para `{ error }`.
 */
export async function authSignInWithPasswordSafe(
  supabase: SupabaseClient,
  credentials: { email: string; password: string },
): Promise<Awaited<ReturnType<SupabaseClient["auth"]["signInWithPassword"]>>> {
  return runAuthCallWithWireRetries("signIn", () => supabase.auth.signInWithPassword(credentials));
}

export async function authSignUpSafe(
  supabase: SupabaseClient,
  params: Parameters<SupabaseClient["auth"]["signUp"]>[0],
): Promise<Awaited<ReturnType<SupabaseClient["auth"]["signUp"]>>> {
  return runAuthCallWithWireRetries("signUp", () => supabase.auth.signUp(params));
}

/** Último recurso quando ainda há uma exceção fora do Auth (ex.: navegação). */
export function mensagemFalhaAutenticacaoResidual(fluxo: "login" | "cadastro" | "assinatura"): string {
  if (fluxo === "cadastro") {
    return "Não foi possível concluir o cadastro. Atualize a página (recarregamento forçado: Ctrl+F5 ou Cmd+Shift+R) e tente novamente.";
  }
  if (fluxo === "assinatura") {
    return "Não foi possível continuar com a assinatura. Atualize a página e tente novamente.";
  }
  return "Não foi possível concluir o login. Atualize a página (recarregamento forçado: Ctrl+F5 ou Cmd+Shift+R) e tente novamente.";
}
