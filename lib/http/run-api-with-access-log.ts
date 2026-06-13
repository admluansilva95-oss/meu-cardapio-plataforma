import { NextResponse } from "next/server";
import { logProductionApiAccess } from "@/lib/logging/http-access-log";
import { logStructured } from "@/lib/logging/structured-log";

type MinimalRequest = { method: string };

/**
 * Executa um Route Handler com `finally` que grava uma linha `http.access` em produção
 * (método, rota lógica, status, duração). Captura exceções não tratadas e devolve JSON 500 genérico.
 */
export async function runApiWithAccessLog(
  request: MinimalRequest,
  routePath: string,
  fatalErrorTag: string,
  handler: () => Promise<Response>,
): Promise<Response> {
  const started = performance.now();
  let status = 500;
  try {
    const res = await handler();
    status = res.status;
    return res;
  } catch (unexpected: unknown) {
    logStructured("error", fatalErrorTag, {
      errName: unexpected instanceof Error ? unexpected.name : "unknown",
    });
    status = 500;
    return NextResponse.json(
      { error: "Erro interno. Tente novamente em instantes." },
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  } finally {
    logProductionApiAccess({
      method: request.method,
      path: routePath,
      status,
      durationMs: Math.round(performance.now() - started),
    });
  }
}
