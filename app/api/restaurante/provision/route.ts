import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { type NextRequest } from "next/server";
import {
  getOwnerAuthStorageOptions,
  getSupabaseServerCookieOptions,
} from "@/lib/auth/supabase-session-cookies";
import { provisionRestauranteAfterPayment } from "@/lib/billing/restaurantes";
import { isValidSlug, normalizeSlugInput } from "@/lib/billing/slug";
import { latin1CookieWrite } from "@/lib/http/byte-string-http";
import { jsonWithRequestId } from "@/lib/http/json-with-request-id";
import { runApiWithAccessLog } from "@/lib/http/run-api-with-access-log";
import { requireAdminSupabaseClient } from "@/lib/supabase/admin";
import { serverLatin1SafeFetch } from "@/lib/http/server-latin1-fetch";
import { getPublicSupabaseProjectUrl } from "@/lib/supabase/normalize-public-supabase-url";

export const dynamic = "force-dynamic";

type CookieToSet = { name: string; value: string; options: CookieOptions };

type ProvisionBody = {
  slug?: string;
  whatsapp?: string;
  restaurantName?: string;
};

export async function POST(request: NextRequest) {
  return runApiWithAccessLog(
    request,
    "/api/restaurante/provision",
    "api.restaurante.provision.fatal",
    async ({ request, requestId }) => {
      const req = request as NextRequest;
      const cookieStore = await cookies();
      const authCookieWrites: CookieToSet[] = [];

      const applyAuthCookies = (target: ReturnType<typeof jsonWithRequestId>) => {
        authCookieWrites.forEach((raw) => {
          const { name, value, options } = latin1CookieWrite(raw);
          target.cookies.set(name, value, options);
        });
        return target;
      };

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
                authCookieWrites.push({ name, value, options });
              });
            },
          },
          global: { fetch: serverLatin1SafeFetch },
        },
      );

      const bearerToken = req.headers.get("Authorization")?.startsWith("Bearer ")
        ? req.headers.get("Authorization")!.slice(7).trim()
        : null;

      let user = null as Awaited<
        ReturnType<typeof supabase.auth.getUser>
      >["data"]["user"];

      if (bearerToken) {
        const {
          data: { user: bearerUser },
          error: bearerError,
        } = await supabase.auth.getUser(bearerToken);
        if (!bearerError && bearerUser) user = bearerUser;
      }
      if (!user) {
        const {
          data: { user: cookieUser },
          error: cookieError,
        } = await supabase.auth.getUser();
        if (!cookieError && cookieUser) user = cookieUser;
      }

      if (!user) {
        return applyAuthCookies(
          jsonWithRequestId(requestId, { error: "Não autorizado." }, 401),
        );
      }

      let body: ProvisionBody;
      try {
        body = (await req.json()) as ProvisionBody;
      } catch {
        return applyAuthCookies(
          jsonWithRequestId(requestId, { error: "JSON inválido." }, 400),
        );
      }

      const slug = normalizeSlugInput(typeof body.slug === "string" ? body.slug : "");
      if (!isValidSlug(slug)) {
        return applyAuthCookies(
          jsonWithRequestId(
            requestId,
            {
              error:
                "Slug inválido. Use letras minúsculas, números e hífens (mínimo 3 caracteres).",
            },
            400,
          ),
        );
      }

      const admin = requireAdminSupabaseClient();

      const { data: assinatura } = await admin
        .from("assinaturas")
        .select("id")
        .eq("user_id", user.id)
        .in("status", ["active", "trialing"])
        .limit(1)
        .maybeSingle();

      if (!assinatura) {
        return applyAuthCookies(
          jsonWithRequestId(
            requestId,
            { error: "Assinatura ativa não encontrada. Conclua o pagamento antes de configurar o cardápio." },
            403,
          ),
        );
      }

      const result = await provisionRestauranteAfterPayment(admin, {
        user_id: user.id,
        slug,
        restaurant_name: typeof body.restaurantName === "string" ? body.restaurantName : undefined,
        whatsapp: typeof body.whatsapp === "string" ? body.whatsapp : undefined,
      });

      if (!result.ok) {
        return applyAuthCookies(
          jsonWithRequestId(requestId, { error: result.error }, 409),
        );
      }

      return applyAuthCookies(
        jsonWithRequestId(requestId, { ok: true, slug: result.slug, restauranteId: result.restaurante_id }, 200),
      );
    },
  );
}
