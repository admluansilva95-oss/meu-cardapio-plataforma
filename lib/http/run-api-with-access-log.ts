import { NextResponse } from "next/server";
import { attachRequestIdToResponse, mergeRequestIdIntoJsonBody } from "@/lib/http/attach-request-id";
import { getOrCreateRequestId } from "@/lib/http/request-id";
import { logProductionApiAccess } from "@/lib/logging/http-access-log";
import { logStructured } from "@/lib/logging/structured-log";

export type ApiRequestContext = {
  request: Request;
  requestId: string;
};

/**
 * Executa um Route Handler com `finally` que grava uma linha `http.access` em produção
 * (método, rota lógica, status, duração, requestId). Captura exceções não tratadas e devolve JSON 500 genérico.
 */
export async function runApiWithAccessLog(
  request: Request,
  routePath: string,
  fatalErrorTag: string,
  handler: (ctx: ApiRequestContext) => Promise<Response>,
): Promise<Response> {
  const requestId = getOrCreateRequestId(request);
  const started = performance.now();
  let status = 500;
  try {
    const res = await handler({ request, requestId });
    status = res.status;
    return attachRequestIdToResponse(res, requestId);
  } catch (unexpected: unknown) {
    const errName = unexpected instanceof Error ? unexpected.name : typeof unexpected;
    const errSummary =
      unexpected instanceof Error
        ? unexpected.message.slice(0, 400)
        : String(unexpected).slice(0, 400);
    logStructured("error", fatalErrorTag, {
      errName,
      errSummary,
      requestId,
    });
    status = 500;
    const body = mergeRequestIdIntoJsonBody(
      { error: "Erro interno. Tente novamente em instantes." },
      requestId,
    );
    const res = NextResponse.json(body, {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
    return attachRequestIdToResponse(res, requestId);
  } finally {
    logProductionApiAccess({
      method: request.method,
      path: routePath,
      status,
      durationMs: Math.round(performance.now() - started),
      requestId,
    });
  }
}
