export type ClientErrorReport = {
  message: string;
  digest?: string;
  url: string;
  slug: string | null;
};

/**
 * Stub para telemetria de erros no browser (Sentry, LogRocket, endpoint próprio).
 * Não envia dados em produção até configurar `NEXT_PUBLIC_CLIENT_ERROR_INGEST_URL` ou integrar SDK.
 */
export async function reportClientErrorToTelemetry(report: ClientErrorReport): Promise<void> {
  const ingest = process.env.NEXT_PUBLIC_CLIENT_ERROR_INGEST_URL?.trim();

  if (process.env.NODE_ENV === "development") {
    console.warn("[telemetry] client error (stub)", report);
  }

  if (ingest) {
    try {
      await fetch(ingest, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...report,
          source: "meu-cardapio",
          env: process.env.NODE_ENV,
        }),
        keepalive: true,
      });
    } catch {
      /* swallow — nunca quebrar a boundary de erro */
    }
    return;
  }

  // Futuro: Sentry.captureException / LogRocket — manter fora do bundle até dependência existir
}
