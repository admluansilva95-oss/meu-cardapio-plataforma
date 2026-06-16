/** Modo inferido a partir de STRIPE_SECRET_KEY (servidor). */
export function stripeKeyModeLabel(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (key.startsWith("sk_test_")) return "test";
  if (key.startsWith("sk_live_")) return "live";
  return "desconhecido";
}

function stripeErrorFields(error: unknown): { code?: string; message: string } {
  if (error instanceof Error) {
    const withCode = error as Error & { code?: unknown };
    const code = typeof withCode.code === "string" ? withCode.code : undefined;
    return { code, message: error.message };
  }
  return { message: String(error) };
}

/**
 * Converte erros da API Stripe em mensagens acionáveis (PT-BR) para o usuário autenticado.
 */
export function mapStripeErrorForUser(
  error: unknown,
  context: "checkout" | "portal",
): string {
  const { code, message } = stripeErrorFields(error);
  const mode = stripeKeyModeLabel();
  const lower = message.toLowerCase();

  if (lower.includes("no such price") || (code === "resource_missing" && lower.includes("price"))) {
    return (
      `O preço do plano não existe na conta Stripe (modo da API: ${mode}). ` +
      "Confira NEXT_PUBLIC_STRIPE_PRICE_ESSENCIAL / NEXT_PUBLIC_STRIPE_PRICE_PREMIUM e STRIPE_SECRET_KEY " +
      "no mesmo ambiente (test ou live)."
    );
  }

  if (code === "api_key_expired" || lower.includes("expired api key")) {
    return "A chave STRIPE_SECRET_KEY expirou. Gere uma nova no Stripe Dashboard e atualize a Vercel.";
  }

  if (code === "api_key_invalid" || lower.includes("invalid api key")) {
    return "STRIPE_SECRET_KEY inválida. Verifique se copiou a chave secreta correta (sk_test_ ou sk_live_).";
  }

  if (lower.includes("no such customer")) {
    return (
      `Cliente Stripe não encontrado (modo da API: ${mode}). ` +
      "As chaves Stripe provavelmente estão em test/live diferente da assinatura original."
    );
  }

  if (lower.includes("url_invalid") || lower.includes("invalid url")) {
    return (
      "URL de retorno do checkout inválida. Configure NEXT_PUBLIC_APP_URL com a URL pública do app " +
      "(ex.: https://seu-dominio.vercel.app)."
    );
  }

  if (lower.includes("no valid payment method types") || lower.includes("payment_method_types")) {
    if (mode === "live") {
      return (
        "Pagamentos reais ainda não estão liberados: no Stripe (modo Live), Cartões aparece como " +
        "«pendente de aprovação». Você já enviou os documentos — aguarde a análise da Stripe " +
        "(e-mail quando for aprovado). Isso não é falha do site. Para testar o fluxo agora, " +
        "use chaves sk_test_ e preços de Test na Vercel."
      );
    }
    return (
      "Nenhum método de pagamento ativo no Stripe (modo test). " +
      "Abra Settings → Payment methods no Dashboard (Test) e ative Cartões."
    );
  }

  if (context === "portal" && lower.includes("billing portal")) {
    return (
      "Portal de cobrança não configurado no Stripe. Ative em Dashboard → Settings → Billing → Customer portal."
    );
  }

  if (message.trim()) {
    return context === "checkout"
      ? `Stripe recusou o checkout: ${message}`
      : `Stripe recusou o portal: ${message}`;
  }

  return context === "checkout"
    ? "Erro ao criar sessão de checkout no Stripe."
    : "Erro ao abrir o portal de cobrança no Stripe.";
}

export function isPlaceholderStripePriceId(priceId: string): boolean {
  const id = priceId.trim();
  return !id || id.includes("placeholder") || id.startsWith("price_xxx");
}
