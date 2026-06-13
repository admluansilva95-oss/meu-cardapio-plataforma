import { createLatin1SafeFetch } from "@/lib/fetch-latin1-safe";

/**
 * Instância única para Route Handlers / libs server-side que usam `fetch` (ex.: `@supabase/supabase-js`).
 * Garante o mesmo saneamento Latin-1 que no browser.
 */
export const serverLatin1SafeFetch = createLatin1SafeFetch(globalThis.fetch.bind(globalThis));
