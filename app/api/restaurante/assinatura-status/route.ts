import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { type NextRequest } from "next/server";
import {
  getOwnerAuthStorageOptions,
  getSupabaseServerCookieOptions,
} from "@/lib/auth/supabase-session-cookies";
import { latin1CookieWrite } from "@/lib/http/byte-string-http";
import { jsonWithRequestId } from "@/lib/http/json-with-request-id";
import { serverLatin1SafeFetch } from "@/lib/http/server-latin1-fetch";
import { runApiWithAccessLog } from "@/lib/http/run-api-with-access-log";
import { getPublicSupabaseProjectUrl } from "@/lib/supabase/normalize-public-supabase-url";

export const dynamic = "force-dynamic";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * GET /api/restaurante/assinatura-status
 * Status bruto da assinatura Stripe (ex.: past_due, unpaid) para alertas no painel admin.
 */
export async function GET(request: NextRequest) {
  return runApiWithAccessLog(
    request,
    "/api/restaurante/assinatura-status",
    "api.restaurante.assinatura_status.fatal",
    async ({ request, requestId }) => {
      const req = request as NextRequest;
      const cookieStore = await cookies();
      const supabase = createServerClient(
        getPublicSupabaseProjectUrl(),
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookieOptions: getSupabaseServerCookieOptions(),
          ...getOwnerAuthStorageOptions(),
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
            setAll(cookiesToSet: CookieToSet[]) {
              cookiesToSet.forEach((raw) => {
                const { name, value, options } = latin1CookieWrite(raw);
                req.cookies.set(name, value);
                try {
                  cookieStore.set(name, value, options);
                } catch {
                  /* ignore */
                }
              });
            },
          },
          global: { fetch: serverLatin1SafeFetch },
        },
      );

      const authHeader = request.headers.get("Authorization");
      const bearerToken = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : null;

      let user = null as Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"];

      if (bearerToken) {
        const {
          data: { user: u },
          error: e,
        } = await supabase.auth.getUser(bearerToken);
        if (!e && u) user = u;
      }
      if (!user) {
        const {
          data: { user: u },
          error: e,
        } = await supabase.auth.getUser();
        if (!e && u) user = u;
      }

      if (!user) {
        return jsonWithRequestId(requestId, { error: "Não autenticado." }, 401);
      }

      const { data: assinatura, error: assinErr } = await supabase
        .from("assinaturas")
        .select("status, stripe_subscription_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (assinErr) {
        return jsonWithRequestId(
          requestId,
          { error: "Não foi possível consultar a assinatura." },
          500,
        );
      }

      return jsonWithRequestId(
        requestId,
        {
          ok: true,
          assinatura: assinatura
            ? {
                status: assinatura.status,
                stripeSubscriptionId: assinatura.stripe_subscription_id,
              }
            : null,
        },
        200,
      );
    },
  );
}
