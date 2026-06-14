import { hasE2eAuthCredentials } from "./env";

/** Falha rápida com mensagem clara (preferível a `test.skip` condicional). */
export function requireE2eAuthCredentials(): void {
  if (!hasE2eAuthCredentials()) {
    throw new Error(
      "Defina E2E_EMAIL e E2E_PASSWORD em .env.local ou .env.e2e (o Playwright carrega esses ficheiros antes dos testes). Opcional: E2E_RESTAURANT_SLUG para um tenant específico.",
    );
  }
}
