import { createBrowserClient } from "@supabase/ssr";
import { createLatin1SafeFetch } from "@/lib/fetch-latin1-safe";

const browserSafeFetch = createLatin1SafeFetch();

/**
 * Cria e retorna o cliente do Supabase para o navegador (Client Components).
 * Utiliza as variáveis de ambiente públicas configuradas no .env.local.
 *
 * `fetch` envolvido evita `TypeError: ByteString` quando JSON/cabeçalhos trazem
 * caracteres fora de Latin-1 (ex.: bullet U+2022 em textos de pedido ou cardápio).
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: browserSafeFetch } },
  );
}