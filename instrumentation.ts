import type { Instrumentation } from "next";

export async function register(): Promise<void> {
  /* Hook reservado (OpenTelemetry, etc.) */
}

/**
 * Erros não tratados em rotas / renderização — log mínimo em produção (sem stack/corpo).
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NODE_ENV !== "production") return;

  const rawPath = String(request.path ?? "");
  const path = rawPath.split("?")[0].slice(0, 400);
  const errName = error instanceof Error ? error.name : "non_error_throw";

  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      tag: "http.request_error",
      method: request.method,
      path,
      routePath: context.routePath,
      routeType: context.routeType,
      routerKind: context.routerKind,
      errName,
    }),
  );
};
