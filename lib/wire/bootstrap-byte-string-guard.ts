/**
 * Efeito colateral mínimo: instala o guard **antes** de módulos seguintes no grafo de imports
 * (ex.: `@supabase/ssr`, uploads) avaliarem `fetch` / `XMLHttpRequest`.
 *
 * Idempotente (`installClientByteStringGuard` usa `window.__BYTE_STRING_GUARD__`).
 * No servidor (sem `window`) não faz nada.
 */
import "@/lib/http/native-http-constructors";
import { installClientByteStringGuard } from "@/lib/wire/install-client-byte-string-guard";

installClientByteStringGuard();
