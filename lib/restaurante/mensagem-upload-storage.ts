import { coalesceSupabaseErrorMessage } from "@/lib/supabase/extrair-mensagem-erro-client";

function mensagemContentTypeNaoAceiteStorage(m: string): string | null {
  if (!m.includes("content-type") || !m.includes("acceptable")) return null;
  if (m.includes("text/plain")) {
    return (
      "O pedido de upload ou gravação foi rejeitado por causa do tipo de conteúdo (o servidor esperava JSON ou multipart). " +
      "Atualize a página com recarregamento forçado (Ctrl+F5 / Cmd+Shift+R). " +
      "Se só falhar com foto, tente guardar sem imagem para confirmar se o problema é no envio do ficheiro."
    );
  }
  return "O servidor recusou o Content-Type do pedido. Atualize a página e tente de novo.";
}

/** Mensagem amigável para falhas de upload no Storage (rede, tamanho, permissão). */
export function mensagemUploadStorageAmigavel(err: unknown): string {
  let raw = coalesceSupabaseErrorMessage(err);
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.status === "number" && o.status > 0 && !raw.includes(String(o.status))) {
      raw = `${raw} (${o.status})`.trim();
    }
    if (
      (typeof o.statusCode === "string" || typeof o.statusCode === "number") &&
      !raw.includes(String(o.statusCode))
    ) {
      raw = `${raw} ${o.statusCode}`.trim();
    }
  }
  const msg = raw.toLowerCase();

  const ct = mensagemContentTypeNaoAceiteStorage(msg);
  if (ct) return ct;

  if (
    /bytestring|cannot convert argument to a bytestring|greater than 255/i.test(msg)
  ) {
    return (
      "O navegador bloqueou o envio por causa de caracteres especiais (ex.: bullet U+2022 no nome do arquivo ou metadados da foto). " +
      "Recarregue a página e tente de novo; se continuar, renomeie a imagem no aparelho para usar só letras, números e extensão .jpg ou .png."
    );
  }
  if (
    /bucket not found/i.test(msg) ||
    (/\b404\b/.test(raw) && /bucket|storage\.objects|object\/public/i.test(msg))
  ) {
    return (
      "O bucket de imagens não existe neste projeto Supabase (erro 404). No SQL Editor, execute as migrações " +
      "`supabase/migrations/20260607140000_storage_restaurant_logos.sql` (bucket `restaurant-logos`) e " +
      "`supabase/migrations/20260621120000_storage_imagens_pratos_bucket.sql` (bucket `imagens-pratos`, público, MIME image/*, RLS insert/select). " +
      "Ou o bloco “STORAGE” em `supabase/init-completo.sql`. Os nomes precisam ser exatamente esses."
    );
  }
  if (/413|payload too large|too large|entity too large|body exceeded/i.test(msg)) {
    return "A imagem é grande demais. Tente uma foto menor (por exemplo até 4 MB) ou outro arquivo.";
  }
  if (/network|fetch failed|failed to fetch|timeout|timed out|offline|503|502|504/i.test(msg)) {
    return "Falha de rede ao enviar a imagem. Verifique sua conexão e tente de novo.";
  }
  if (/jwt|session|auth|unauthor|forbidden|403|401/i.test(msg)) {
    return "Sessão ou permissão inválida para o envio. Saia e entre novamente no painel.";
  }
  if (/unexpected token|is not valid json|json parse|failed to execute 'json'/i.test(raw)) {
    return (
      "O servidor de ficheiros (Storage) devolveu texto que não é JSON (erro de gateway, HTML ou limite). " +
      "Confirme a URL do Supabase e execute a migração do bucket `imagens-pratos` se ainda não o fez."
    );
  }
  if (raw.trim()) return raw.trim();
  return "Não foi possível enviar a imagem. Tente outro arquivo ou salve sem foto.";
}
