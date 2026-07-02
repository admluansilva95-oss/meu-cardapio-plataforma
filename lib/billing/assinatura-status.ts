/** Status Stripe que indicam falha de cobrança / inadimplência. */
export const ASSINATURA_STATUS_INADIMPLENTE = ["past_due", "unpaid"] as const;

export type AssinaturaStatusInadimplente = (typeof ASSINATURA_STATUS_INADIMPLENTE)[number];

export function isAssinaturaInadimplente(
  status: string | null | undefined,
): status is AssinaturaStatusInadimplente {
  return status === "past_due" || status === "unpaid";
}
