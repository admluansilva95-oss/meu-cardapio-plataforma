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
