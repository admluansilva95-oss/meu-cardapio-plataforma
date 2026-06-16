import { NextResponse } from "next/server";
import { mergeRequestIdIntoJsonBody } from "@/lib/http/attach-request-id";

export function jsonWithRequestId(
  requestId: string,
  body: Record<string, unknown>,
  status: number,
  extraHeaders?: Record<string, string>,
): NextResponse {
  return NextResponse.json(mergeRequestIdIntoJsonBody(body, requestId), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}
