import { installClientByteStringGuard } from "@/lib/wire/install-client-byte-string-guard";

/**
 * Corre antes da hidratação (Next.js ≥ 15.3).
 * Garante que `fetch` / `Headers` / `XHR` / `document.cookie` nunca vejam texto fora de Latin-1 no wire.
 */
installClientByteStringGuard();
