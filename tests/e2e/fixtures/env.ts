/** Credenciais opcionais para smoke tests com Supabase real. */
export function hasE2eAuthCredentials(): boolean {
  return Boolean(
    process.env.E2E_EMAIL?.trim() &&
      process.env.E2E_PASSWORD?.trim() &&
      process.env.E2E_RESTAURANT_SLUG?.trim(),
  );
}

export function e2eRestaurantQuery(): string {
  const slug = process.env.E2E_RESTAURANT_SLUG?.trim() ?? "";
  return slug ? `?slug=${encodeURIComponent(slug)}` : "";
}
