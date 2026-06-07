import { createBrowserClient } from "@supabase/ssr";

/**
 * Cria e retorna o cliente do Supabase para o navegador (Client Components).
 * Utiliza as variáveis de ambiente públicas configuradas no .env.local.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}