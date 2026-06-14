import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  getOwnerAuthStorageOptions,
  getSupabaseServerCookieOptions,
} from "@/lib/auth/supabase-session-cookies";
import { createSubscriptionCheckoutSession } from "@/lib/billing/checkout";
import { latin1CookieWrite } from "@/lib/http/byte-string-http";
import { jsonWithRequestId } from "@/lib/http/json-with-request-id";
import { logStructured } from "@/lib/logging/structured-log";
import { requireAdminSupabaseClient } from "@/lib/supabase/admin";
import { serverLatin1SafeFetch } from "@/lib/http/server-latin1-fetch";
import { runApiWithAccessLog } from "@/lib/http/run-api-with-access-log";

type CookieToSet = { name: string; value: string; options: CookieOptions };

type CheckoutBody = {
  priceId?: string;
  userId?: string;
  slug?: string;
  restaurantName?: string;
  whatsapp?: string;
};

/** Replica Set-Cookie com opções completas (getAll do Next não devolve todas as opções). */
function applyAuthCookies(target: NextResponse, writes: CookieToSet[]) {
  writes.forEach((raw) => {
    const { name, value, options } = latin1CookieWrite(raw);
    target.cookies.set(name, value, options);
  });
  return target;
}

export async function POST(request: NextRequest) {
  return runApiWithAccessLog(
    request,
    "/api/checkout/create-session",
    "api.checkout.create_session.fatal",
    async ({ requestId }) => {
      const cookieStore = await cookies();

      // Instância única para acumular cookies de sessão/refresh (mesma ideia do proxy em `proxy.ts`).
      const sessionResponse = NextResponse.next({
        request: { headers: request.headers },
      });

      /** Gravações feitas durante getUser (ex.: refresh) para repassar ao JSON final. */
      const authCookieWrites: CookieToSet[] = [];

      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
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
                // 1. Atualiza a requisição para que os Server Components adiante vejam o cookie novo imediatamente
                request.cookies.set(name, value);

                // 2. Atualiza a resposta para salvar o cookie de forma definitiva no navegador do usuário
                sessionResponse.cookies.set(name, value, options);

                try {
                  cookieStore.set(name, value, options);
                } catch {
                  // Route Handler pode estar em contexto onde cookieStore.set não aplica; request + sessionResponse bastam.
                }

                authCookieWrites.push({ name, value, options });
              });
            },
          },
          global: { fetch: serverLatin1SafeFetch },
        },
      );

      try {
        let body: CheckoutBody;
        try {
          const raw = await request.json();
          if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
            const res = jsonWithRequestId(
              requestId,
              {
                error:
                  "O corpo deve ser um objeto JSON com priceId, userId, slug e campos opcionais.",
              },
              400,
            );
            return applyAuthCookies(res, authCookieWrites);
          }
          body = raw as CheckoutBody;
        } catch {
          const res = jsonWithRequestId(
            requestId,
            { error: "JSON inválido ou corpo vazio." },
            400,
          );
          return applyAuthCookies(res, authCookieWrites);
        }
        const { priceId, userId, slug, restaurantName, whatsapp } = body;

        if (!priceId || typeof priceId !== "string") {
          const res = jsonWithRequestId(
            requestId,
            { error: "priceId é obrigatório." },
            400,
          );
          return applyAuthCookies(res, authCookieWrites);
        }

        if (!userId || typeof userId !== "string") {
          const res = jsonWithRequestId(
            requestId,
            { error: "userId é obrigatório." },
            400,
          );
          return applyAuthCookies(res, authCookieWrites);
        }

        if (!slug || typeof slug !== "string") {
          const res = jsonWithRequestId(
            requestId,
            { error: "slug é obrigatório." },
            400,
          );
          return applyAuthCookies(res, authCookieWrites);
        }

        const restaurantNameResolved =
          typeof restaurantName === "string" ? restaurantName : "";

        const authHeader = request.headers.get("Authorization");
        const bearerToken = authHeader?.startsWith("Bearer ")
          ? authHeader.slice(7).trim()
          : null;
        const hasBearer = Boolean(bearerToken);
        const cookieNames = cookieStore.getAll().map((c) => c.name);
        const supabaseCookiePresent = cookieNames.some(
          (n) => n.startsWith("sb-") && n.includes("auth"),
        );

        let user = null as Awaited<
          ReturnType<typeof supabase.auth.getUser>
        >["data"]["user"];

        if (hasBearer && bearerToken) {
          const {
            data: { user: bearerUser },
            error: bearerError,
          } = await supabase.auth.getUser(bearerToken);

          if (!bearerError && bearerUser) {
            user = bearerUser;
          }
        }

        if (!user) {
          const {
            data: { user: cookieUser },
            error: cookieError,
          } = await supabase.auth.getUser();

          if (!cookieError && cookieUser) {
            user = cookieUser;
          }
        }

        if (!user) {
          logStructured("warn", "api.checkout.create_session.unauthorized", {
            hadBearer: hasBearer,
            supabaseAuthCookie: supabaseCookiePresent,
            requestId,
          });
          const res = jsonWithRequestId(
            requestId,
            { error: "Sessão inválida ou expirada." },
            401,
          );
          return applyAuthCookies(res, authCookieWrites);
        }

        if (user.id !== userId) {
          logStructured(
            "warn",
            "api.checkout.create_session.user_id_mismatch",
            {},
          );
          const res = jsonWithRequestId(
            requestId,
            { error: "Usuário não autorizado para esta operação." },
            403,
          );
          return applyAuthCookies(res, authCookieWrites);
        }

        let admin;
        try {
          admin = requireAdminSupabaseClient();
        } catch (err) {
          logStructured("error", "api.checkout.create_session.admin_client", {
            errName: err instanceof Error ? err.name : "unknown",
          });
          const res = jsonWithRequestId(
            requestId,
            { error: "Configuração do servidor incompleta." },
            500,
          );
          return applyAuthCookies(res, authCookieWrites);
        }

        const idempotencyHeader = request.headers.get("Idempotency-Key")?.trim();
        const idempotencyKey =
          idempotencyHeader && idempotencyHeader.length <= 255
            ? idempotencyHeader
            : undefined;

        const result = await createSubscriptionCheckoutSession(admin, {
          userId: user.id,
          userEmail: user.email,
          priceId,
          slug,
          restaurantName: restaurantNameResolved,
          whatsapp: typeof whatsapp === "string" ? whatsapp : undefined,
          idempotencyKey,
        });

        if (!result.ok) {
          const res = jsonWithRequestId(
            requestId,
            { error: result.error },
            result.status,
          );
          return applyAuthCookies(res, authCookieWrites);
        }

        const res = jsonWithRequestId(requestId, { url: result.url }, 200);
        return applyAuthCookies(res, authCookieWrites);
      } catch (err) {
        const isJson =
          err instanceof SyntaxError ||
          (err instanceof Error &&
            (err.message.toLowerCase().includes("json") ||
              err.message.toLowerCase().includes("unexpected")));
        if (isJson) {
          logStructured("warn", "api.checkout.create_session.bad_json", {
            requestId,
          });
          const res = jsonWithRequestId(
            requestId,
            { error: "JSON inválido ou corpo vazio." },
            400,
          );
          return applyAuthCookies(res, authCookieWrites);
        }
        logStructured("error", "api.checkout.create_session.unexpected", {
          errName: err instanceof Error ? err.name : "unknown",
          errSummary:
            err instanceof Error
              ? err.message.slice(0, 400)
              : String(err).slice(0, 400),
          requestId,
        });
        const res = jsonWithRequestId(
          requestId,
          { error: "Erro interno ao criar sessão de checkout." },
          500,
        );
        return applyAuthCookies(res, authCookieWrites);
      }
    },
  );
}
