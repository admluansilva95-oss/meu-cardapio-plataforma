/**
 * Linha única de acesso HTTP para produção (Vercel / Docker): sem corpo, sem PII.
 * Use no `finally` de Route Handlers quando quiser métricas de latência por rota.
 */
export function logProductionApiAccess(meta: {
  method: string;
  path: string;
  status: number;
  durationMs: number;
}): void {
  if (process.env.NODE_ENV !== "production") return;
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      tag: "http.access",
      method: meta.method,
      path: meta.path,
      status: meta.status,
      durationMs: meta.durationMs,
    }),
  );
}
