import { NextResponse } from "next/server";
import { REQUEST_ID_HEADER } from "@/lib/http/request-id";

/**
 * Garante cabeçalho e (opcionalmente) campo `requestId` no corpo JSON de erros.
 */
export function attachRequestIdToResponse(res: Response, requestId: string): Response {
  if (res.headers.get(REQUEST_ID_HEADER) === requestId) return res;

  if (res instanceof NextResponse) {
    res.headers.set(REQUEST_ID_HEADER, requestId);
    return res;
  }

  const headers = new Headers(res.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

/**
 * Injeta `requestId` num JSON de erro já serializado (objeto plano).
 */
export function mergeRequestIdIntoJsonBody(
  body: Record<string, unknown>,
  requestId: string,
): Record<string, unknown> {
  return { ...body, requestId };
}
