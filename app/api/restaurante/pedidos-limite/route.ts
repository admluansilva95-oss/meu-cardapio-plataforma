import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { type NextRequest } from "next/server";
import { avaliarLimitePedidosMensal } from "@/lib/billing/pedidos-limite-mensal";
import {
  getOwnerAuthStorageOptions,
  getSupabaseServerCookieOptions,
} from "@/lib/auth/supabase-session-cookies";
import { latin1CookieWrite } from "@/lib/http/byte-string-http";
import { jsonWithRequestId } from "@/lib/http/json-with-request-id";
import { serverLatin1SafeFetch } from "@/lib/http/server-latin1-fetch";
import { runApiWithAccessLog } from "@/lib/http/run-api-with-access-log";
import { getPublicSupabaseProjectUrl } from "@/lib/supabase/normalize-public-supabase-url";
import { isUuid } from "@/lib/restaurante/pedido-vitrine-calculo";

export const dynamic = "force-dynamic";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * GET /api/restaurante/pedidos-limite?restauranteId=uuid
 * Status de uso mensal do plano Essencial para banner/paywall no painel admin.
 */
export async function GET(request: NextRequest) {
  return runApiWithAccessLog(
    request,
    "/api/restaurante/pedidos-limite",
    "api.restaurante.pedidos_limite.fatal",
    async ({ request, requestId }) => {
      const req = request as NextRequest;
      const restauranteId = req.nextUrl.searchParams.get("restauranteId")?.trim() ?? "";
      if (!restauranteId || !isUuid(restauranteId)) {
        return jsonWithRequestId(requestId, { error: "restauranteId inválido." }, 400);
      }

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

      const { data: rest, error: restErr } = await supabase
        .from("restaurantes")
        .select("id, owner_id")
        .eq("id", restauranteId)
        .maybeSingle();

      if (restErr) {
        return jsonWithRequestId(requestId, { error: "Não foi possível validar o restaurante." }, 500);
      }
      if (!rest) {
        return jsonWithRequestId(requestId, { error: "Restaurante não encontrado." }, 404);
      }
      if (rest.owner_id !== user.id) {
        return jsonWithRequestId(requestId, { error: "Sem permissão para este restaurante." }, 403);
      }

      const avaliacao = await avaliarLimitePedidosMensal(restauranteId);

      return jsonWithRequestId(
        requestId,
        {
          ok: true,
          limite: {
            estado: avaliacao.estado,
            pedidosNoMes: avaliacao.pedidosNoMes,
            limite: avaliacao.limite,
            percentualAtual: avaliacao.percentualAtual,
          },
        },
        200,
      );
    },
  );
}
