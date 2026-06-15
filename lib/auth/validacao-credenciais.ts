/** E-mail prático (RFC completa no servidor fica a cargo do Supabase). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMAIL_MAX = 254;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 128;

export function validarEmailCliente(
  raw: string,
): { ok: true; email: string } | { ok: false; mensagem: string } {
  const email = raw.trim().toLowerCase();
  if (!email) return { ok: false, mensagem: "Informe o e-mail." };
  if (email.length > EMAIL_MAX) return { ok: false, mensagem: "E-mail muito longo." };
  if (!EMAIL_RE.test(email)) return { ok: false, mensagem: "Informe um e-mail válido." };
  return { ok: true, email };
}

export function validarSenhaCliente(raw: string): { ok: true } | { ok: false; mensagem: string } {
  if (raw.length < PASSWORD_MIN) {
    return { ok: false, mensagem: `A senha deve ter pelo menos ${PASSWORD_MIN} caracteres.` };
  }
  if (raw.length > PASSWORD_MAX) {
    return { ok: false, mensagem: `A senha deve ter no máximo ${PASSWORD_MAX} caracteres.` };
  }
  return { ok: true };
}

const FALLBACK_AUTH =
  "Não foi possível concluir a autenticação. Atualize a página (Ctrl+F5 ou Cmd+Shift+R), confirme o e-mail e a palavra-passe e tente novamente.";

const ERRO_DESCONHECIDO = "Erro desconhecido";

/**
 * Extrai texto útil do GoTrue / `AuthError` (mensagem vazia é comum em alguns caminhos do SDK).
 */
function normalizeAuthErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    const t = error.trim();
    return t.length > 0 ? t : ERRO_DESCONHECIDO;
  }
  if (error !== null && typeof error === "object") {
    const o = error as Record<string, unknown>;
    const parts: string[] = [];
    for (const k of ["message", "msg", "error_description", "hint"] as const) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) parts.push(v.trim());
    }
    if (parts.length > 0) return parts.join(" — ");
  }
  return ERRO_DESCONHECIDO;
}

/** Código de erro opcional: parâmetro explícito ou `code` no objeto passado como primeiro argumento. */
function normalizeAuthErrorCode(code: unknown, messageSource: unknown): string {
  if (code !== undefined && code !== null && String(code).trim().length > 0) {
    return String(code).trim().toLowerCase();
  }
  if (messageSource !== null && typeof messageSource === "object") {
    const nested = (messageSource as { code?: unknown }).code;
    if (nested !== undefined && nested !== null) {
      return String(nested).trim().toLowerCase();
    }
  }
  return "";
}

function isRefreshOrJwtInvalidGrant(messageLower: string): boolean {
  return (
    messageLower.includes("refresh") ||
    messageLower.includes("refresh_token") ||
    (messageLower.includes("jwt") && !messageLower.includes("invalid login")) ||
    messageLower.includes("token expired") ||
    messageLower.includes("session expired") ||
    messageLower.includes("session not found")
  );
}

/**
 * Mensagem amigável para erros comuns do `signUp` / `signInWithPassword` do Supabase.
 * Aceita `string` ou objeto estilo `AuthError` (`message`, `code`, `status`, `error_description`).
 */
export function mensagemErroSupabaseAuthAmigavel(source: unknown, code?: unknown): string {
  try {
    const resolved = normalizeAuthErrorMessage(source);
    const m = resolved.toLowerCase();
    const c = normalizeAuthErrorCode(code, source);

    if (
      c === "invalid_credentials" ||
      c === "user_banned" ||
      c === "user_suspended"
    ) {
      if (c === "user_banned" || c === "user_suspended") {
        return "Esta conta está suspensa ou bloqueada. Contacte o suporte do serviço.";
      }
      return "E-mail ou senha incorretos. Verifique os dados ou use “Esqueci a senha” no Supabase.";
    }

    if (c === "bad_jwt" || c === "bad_jwt_signature") {
      return "A sessão é inválida ou expirou. Atualize a página e faça login novamente.";
    }

    /** `invalid_grant` no password grant = credenciais erradas; no refresh = sessão. */
    if (c === "invalid_grant") {
      if (isRefreshOrJwtInvalidGrant(m)) {
        return "A sessão é inválida ou expirou. Atualize a página e faça login novamente.";
      }
      return "E-mail ou senha incorretos. Verifique os dados ou use “Esqueci a senha” no Supabase.";
    }

    if (
      m.includes("already registered") ||
      m.includes("user already exists") ||
      m.includes("email address is already") ||
      m.includes("already been registered") ||
      c === "user_already_exists"
    ) {
      return "Este e-mail já está cadastrado. Use “Entrar” ou recuperação de senha.";
    }
    if (
      m.includes("invalid login credentials") ||
      m.includes("invalid credentials") ||
      m.includes("wrong password") ||
      m.includes("incorrect password")
    ) {
      return "E-mail ou senha incorretos. Verifique os dados ou use “Esqueci a senha” no Supabase.";
    }
    if (
      m.includes("email not confirmed") ||
      m.includes("confirm your email") ||
      c === "email_not_confirmed"
    ) {
      return "Confirme o e-mail antes de entrar (verifique a caixa de entrada e o spam).";
    }
    if (m.includes("password") && m.includes("weak")) {
      return "Senha fraca demais para a política do projeto. Use letras e números e aumente o tamanho.";
    }
    if (
      m.includes("rate limit") ||
      m.includes("too many requests") ||
      c === "over_request_rate_limit" ||
      c === "too_many_requests"
    ) {
      return "Muitas tentativas. Aguarde um minuto e tente novamente.";
    }
    if (m.includes("no api key") || m.includes("api key found")) {
      return "O site não está ligado ao servidor de autenticação. As credenciais públicas do Supabase precisam de ser configuradas no deploy (URL e chave anónima).";
    }
    if (m.includes("cors") || m.includes("blocked by cors")) {
      return "O navegador bloqueou o pedido. Confirme o domínio em Supabase → Authentication → URL Configuration (Site URL e Redirect URLs).";
    }
    if (m.includes("aborted") || m.includes("abort")) {
      return "O pedido foi interrompido. Tente novamente sem sair desta página.";
    }
    if (m.includes("timeout") || m.includes("timed out")) {
      return "O servidor demorou a responder. Aguarde um instante e tente novamente.";
    }
    if (
      m.includes("failed to fetch") ||
      m.includes("networkerror") ||
      m.includes("network request failed") ||
      m.includes("load failed")
    ) {
      return "Não foi possível contactar o servidor de autenticação. Verifique a ligação à internet ou tente mais tarde.";
    }
    if (
      (m.includes("jwt") || m.includes("session")) &&
      !m.includes("invalid login") &&
      !m.includes("invalid credentials")
    ) {
      return "A sessão é inválida ou expirou. Atualize a página e faça login novamente.";
    }
    if (c.length > 0 && resolved === ERRO_DESCONHECIDO) {
      return `Não foi possível entrar (código: ${c}). Tente de novo; se persistir, confirme o domínio em Supabase → Authentication → URL Configuration.`;
    }
    if (resolved !== ERRO_DESCONHECIDO && !m.includes("erro desconhecido")) {
      return `Não foi possível entrar: ${resolved.slice(0, 280)}`;
    }
    return FALLBACK_AUTH;
  } catch {
    return FALLBACK_AUTH;
  }
}
