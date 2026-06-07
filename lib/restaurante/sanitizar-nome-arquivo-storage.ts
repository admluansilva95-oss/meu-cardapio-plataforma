/**
 * Normaliza o nome original do arquivo para segmentos seguros no Storage / multipart
 * (evita ByteString: espaços, acentos e símbolos viram hífen; só [a-z0-9_-] no resultado).
 */
export function sanitizarNomeArquivoStorageBase(nomeOriginal: string): string {
  const semExt = nomeOriginal.replace(/\.[^/.]+$/i, "");
  return semExt
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
    .toLowerCase();
}
