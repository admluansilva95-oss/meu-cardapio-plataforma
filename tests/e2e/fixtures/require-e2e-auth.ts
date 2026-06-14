import { hasE2eAuthCredentials } from "./env";

/** Falha rápida com mensagem clara (preferível a `test.skip` condicional). */
export function requireE2eAuthCredentials(): void {
  if (!hasE2eAuthCredentials()) {
    throw new Error(
      "Defina E2E_EMAIL e E2E_PASSWORD em .env.local ou .env.e2e (carregados em tests/e2e/global-setup). Opcional: E2E_RESTAURANT_SLUG. As credenciais devem corresponder a um utilizador válido no projeto Supabase do mesmo ambiente que NEXT_PUBLIC_SUPABASE_* (a palavra-passe pode conter Unicode; o pedido de login já não a trunca no JSON).",
    );
  }
}
