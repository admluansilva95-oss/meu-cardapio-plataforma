import "@/lib/wire/bootstrap-byte-string-guard";

/**
 * Corre antes da hidratação (Next.js ≥ 15.3).
 * `fetch` global instrumentado + endurecimento leve de `XMLHttpRequest` (ver `installClientByteStringGuard`).
 */
