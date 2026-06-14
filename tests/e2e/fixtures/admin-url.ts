import { e2eRestaurantQuery } from "./env";

/**
 * O middleware (`proxy.ts`) exige assinatura ativa, exceto quando `checkout=success`
 * (fluxo pós-Stripe). Nos E2E usamos esse parâmetro para aceder ao painel sem Stripe/DB de billing.
 */
export function buildAdminUrlWithCheckoutBypass(): string {
  const q = e2eRestaurantQuery();
  const joiner = q.includes("?") ? "&" : "?";
  return `/admin${q}${joiner}checkout=success`;
}
