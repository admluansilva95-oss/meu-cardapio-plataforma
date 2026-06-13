/** Mensagem amigável para falhas de upload no Storage (rede, tamanho, permissão). */
export function mensagemUploadStorageAmigavel(err: unknown): string {
  let raw = "";
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.message === "string") raw = o.message;
    if (typeof o.statusCode === "string" || typeof o.statusCode === "number") {
      raw = `${raw} ${o.statusCode}`.trim();
    }
  } else if (typeof err === "string") {
    raw = err;
  }
  const msg = raw.toLowerCase();
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
      "`supabase/migrations/20260621120000_storage_imagens_pratos_bucket.sql` (bucket `imagens-pratos`), " +
      "ou o bloco “STORAGE” em `supabase/init-completo.sql`. Os nomes precisam ser exatamente esses."
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
  if (raw.trim()) return raw.trim();
  return "Não foi possível enviar a imagem. Tente outro arquivo ou salve sem foto.";
}
