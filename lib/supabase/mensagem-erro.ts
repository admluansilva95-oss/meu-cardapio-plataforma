/** Mensagem amigável para erros comuns do PostgREST / RLS no painel. */
export function mensagemErroSupabasePainel(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("row-level security") || m.includes("42501") || m.includes("permission denied")) {
    return "Sem permissão para salvar neste cardápio. Use o link do seu painel (sem trocar o slug na barra de endereço) ou confira no Supabase se o restaurante tem o campo owner_id igual ao seu usuário em Authentication.";
  }
  return message;
}
