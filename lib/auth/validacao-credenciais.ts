/** E-mail prático (RFC completa no servidor fica a cargo do Supabase). */
const EMAIL_RE =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMAIL_MAX = 254;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 128;

export function validarEmailCliente(raw: string): { ok: true; email: string } | { ok: false; mensagem: string } {
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

/** Mensagem amigável para erros comuns do `signUp` / `signInWithPassword` do Supabase. */
export function mensagemErroSupabaseAuthAmigavel(message: string, code?: string): string {
  const m = message.toLowerCase();
  const c = (code ?? "").toLowerCase();

  if (
    m.includes("already registered") ||
    m.includes("user already exists") ||
    m.includes("email address is already") ||
    m.includes("already been registered") ||
    c === "user_already_exists"
  ) {
    return "Este e-mail já está cadastrado. Use “Entrar” ou recuperação de senha.";
  }
  if (m.includes("invalid login credentials") || m.includes("invalid credentials")) {
    return "E-mail ou senha incorretos. Verifique os dados ou use “Esqueci a senha” no Supabase.";
  }
  if (m.includes("email not confirmed") || m.includes("confirm your email")) {
    return "Confirme o e-mail antes de entrar (verifique a caixa de entrada e o spam).";
  }
  if (m.includes("password") && m.includes("weak")) {
    return "Senha fraca demais para a política do projeto. Use letras e números e aumente o tamanho.";
  }
  if (m.includes("rate limit") || m.includes("too many requests")) {
    return "Muitas tentativas. Aguarde um minuto e tente novamente.";
  }
  if (m.includes("no api key") || m.includes("api key found")) {
    return "O site não está ligado ao servidor de autenticação. As credenciais públicas do Supabase precisam de ser configuradas no deploy (URL e chave anónima).";
  }
  return message;
}
