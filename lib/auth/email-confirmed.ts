/** Utilizador com e-mail confirmado no GoTrue (cadastro com confirmação obrigatória). */
export function isSupabaseUserEmailConfirmed(
  user:
    | {
        email_confirmed_at?: string | null;
        confirmed_at?: string | null;
      }
    | null
    | undefined,
): boolean {
  if (!user) return false;
  if (user.email_confirmed_at) return true;
  if (user.confirmed_at) return true;
  return false;
}

/** Só avança para Stripe Checkout após confirmação de e-mail e sessão válida. */
export function canProceedToSubscriptionCheckout(
  user: { email_confirmed_at?: string | null; confirmed_at?: string | null } | null | undefined,
  session: { user?: { email_confirmed_at?: string | null; confirmed_at?: string | null } | null } | null,
): boolean {
  const resolvedUser = user ?? session?.user ?? null;
  return Boolean(session?.user && isSupabaseUserEmailConfirmed(resolvedUser));
}
