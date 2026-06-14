import { hasE2eAuthCredentials, hasPublicSupabaseEnv } from "./env";

/**
 * Falha rápida com mensagem clara (preferível a `test.skip` condicional).
 * Inclui `NEXT_PUBLIC_SUPABASE_*` para evitar 30s em `/login` com erro “ligado ao servidor de autenticação”.
 */
export function requireE2eAuthCredentials(): void {
  if (!hasE2eAuthCredentials()) {
    throw new Error(
      "Defina E2E_EMAIL e E2E_PASSWORD em `.env.local`, `.env.e2e` na raiz ou `tests/e2e/.env.e2e` (carregados por `playwright.config.ts` e `global-setup.ts`). Opcional: E2E_RESTAURANT_SLUG. As credenciais devem corresponder a um utilizador válido no mesmo projeto Supabase que NEXT_PUBLIC_SUPABASE_*.",
    );
  }
  if (!hasPublicSupabaseEnv()) {
    throw new Error(
      "E2E (integração): defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no mesmo sítio que as credenciais E2E (`.env.local`, `.env.e2e` na raiz ou `tests/e2e/.env.e2e`). O processo do Playwright passa estas variáveis ao `npm run dev` filho. Se já corre `npm run dev` noutro terminal, pare-o e volte a correr os testes (reuseExistingServer reutiliza o servidor antigo sem as novas variáveis).",
    );
  }
}
