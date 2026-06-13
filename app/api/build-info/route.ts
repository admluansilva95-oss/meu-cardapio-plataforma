import { type NextRequest } from "next/server";
import { jsonWithRequestId } from "@/lib/http/json-with-request-id";
import { runApiWithAccessLog } from "@/lib/http/run-api-with-access-log";

export const dynamic = "force-dynamic";

/**
 * Permite ao cliente detectar deploy novo (bundle antigo vs API nova).
 */
export async function GET(request: NextRequest) {
  return runApiWithAccessLog(
    request,
    "/api/build-info",
    "api.build_info.fatal",
    async ({ requestId }) => {
      const buildId =
        process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
        process.env.NEXT_PUBLIC_BUILD_ID?.trim() ||
        "unknown";
      return jsonWithRequestId(requestId, { buildId }, 200);
    },
  );
}
