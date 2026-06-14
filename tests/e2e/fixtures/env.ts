/** Credenciais para testes de login/admin contra Supabase real (Stripe/assinatura não obrigatórios com `checkout=success` no URL). */
export function hasE2eAuthCredentials(): boolean {
  return Boolean(process.env.E2E_EMAIL?.trim() && process.env.E2E_PASSWORD?.trim());
}

export function e2eRestaurantQuery(): string {
  const slug = process.env.E2E_RESTAURANT_SLUG?.trim() ?? "";
  return slug ? `?slug=${encodeURIComponent(slug)}` : "";
}
