/** Credenciais para testes de login/admin contra Supabase real (Stripe/assinatura não obrigatórios com `checkout=success` no URL). */
export function hasE2eAuthCredentials(): boolean {
  return Boolean(process.env.E2E_EMAIL?.trim() && process.env.E2E_PASSWORD?.trim());
}

/** O bundle do browser e o `webServer` do Playwright precisam destas variáveis no mesmo processo que carrega `.env.*` (ver `loadLocalEnvFiles`). */
export function hasPublicSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}

export function e2eRestaurantQuery(): string {
  const slug = process.env.E2E_RESTAURANT_SLUG?.trim() ?? "";
  return slug ? `?slug=${encodeURIComponent(slug)}` : "";
}
