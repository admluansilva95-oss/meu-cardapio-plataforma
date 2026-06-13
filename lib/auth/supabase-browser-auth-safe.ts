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

function syntheticAuthError(message: string): AuthError {
  return {
    message,
    name: "AuthError",
    status: 400,
  } as AuthError;
}

/**
 * O SDK pode **lançar** em falhas de rede / configuração; normaliza para `{ error }`
 * para o fluxo tratar como `signInWithPassword` habitual.
 */
export async function authSignInWithPasswordSafe(
  supabase: SupabaseClient,
  credentials: { email: string; password: string },
): Promise<Awaited<ReturnType<SupabaseClient["auth"]["signInWithPassword"]>>> {
  try {
    return await supabase.auth.signInWithPassword(credentials);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      data: { user: null, session: null },
      error: syntheticAuthError(msg || "sign_in_failed"),
    };
  }
}

export async function authSignUpSafe(
  supabase: SupabaseClient,
  params: Parameters<SupabaseClient["auth"]["signUp"]>[0],
): Promise<Awaited<ReturnType<SupabaseClient["auth"]["signUp"]>>> {
  try {
    return await supabase.auth.signUp(params);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      data: { user: null, session: null },
      error: syntheticAuthError(msg || "sign_up_failed"),
    };
  }
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
      error: syntheticAuthError(msg || "get_session_failed"),
    };
  }
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
