import { coalesceSupabaseErrorMessage } from "@/lib/supabase/extrair-mensagem-erro-client";

function mensagemContentTypeNaoAceite(m: string): string | null {
  if (!m.includes("content-type") || !m.includes("acceptable")) return null;
  if (m.includes("text/plain")) {
    return (
      "O servidor recusou o pedido porque o corpo foi enviado como texto simples em vez de JSON " +
      "(cabeçalho Content-Type em falta ou incorreto). Atualize a página com recarregamento forçado " +
      "(Ctrl+F5 ou Cmd+Shift+R) e tente de novo; se continuar, saia e volte a entrar no painel."
    );
  }
  if (m.includes("application/json") && m.includes("charset")) {
    return (
      "O servidor recusou o valor do cabeçalho Content-Type (por vezes por causa de `charset=…`). " +
      "Atualize a página ou tente novamente; em projetos self-hosted pode ser necessário atualizar o PostgREST."
    );
  }
  return "O servidor recusou o tipo de conteúdo (Content-Type) do pedido. Atualize a página e tente de novo.";
}

/** Mensagem amigável para erros comuns do PostgREST / RLS no painel. */
export function mensagemErroSupabasePainel(messageOrError: string | unknown): string {
  const message =
    typeof messageOrError === "string"
      ? messageOrError
      : coalesceSupabaseErrorMessage(messageOrError);
  const m = message.toLowerCase();

  const ct = mensagemContentTypeNaoAceite(m);
  if (ct) return ct;

  if (m.includes("row-level security") || m.includes("42501") || m.includes("permission denied")) {
    return "Sem permissão para salvar neste cardápio. Use o link do seu painel (sem trocar o slug na barra de endereço) ou confira no Supabase se o restaurante tem o campo owner_id igual ao seu usuário em Authentication.";
  }

  if (/unexpected token|is not valid json|json parse|failed to execute 'json'/i.test(message)) {
    return (
      "A API devolveu uma resposta que não é JSON (por exemplo HTML de erro, proxy ou página a meio). " +
      "Confirme NEXT_PUBLIC_SUPABASE_URL (só a base do projeto, sem /rest/v1) e se o projeto Supabase está ativo."
    );
  }

  return message.trim() || "Erro desconhecido ao comunicar com o servidor.";
}
