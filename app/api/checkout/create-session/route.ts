import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createSubscriptionCheckoutSession } from "@/lib/billing/checkout";
import { latin1CookieWrite } from "@/lib/http/byte-string-http";
import { logStructured } from "@/lib/logging/structured-log";
import { requireAdminSupabaseClient } from "@/lib/supabase/admin";
import { serverLatin1SafeFetch } from "@/lib/http/server-latin1-fetch";

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
      cookieOptions: {
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
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
    const body = (await request.json()) as CheckoutBody;
    const { priceId, userId, slug, restaurantName, whatsapp } = body;

    if (!priceId || typeof priceId !== "string") {
      return NextResponse.json({ error: "priceId é obrigatório." }, { status: 400 });
    }

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "userId é obrigatório." }, { status: 400 });
    }

    if (!slug || typeof slug !== "string") {
      return NextResponse.json({ error: "slug é obrigatório." }, { status: 400 });
    }

    const restaurantNameResolved =
      typeof restaurantName === "string" ? restaurantName : "";

    const authHeader = request.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    const hasBearer = Boolean(bearerToken);
    const cookieNames = cookieStore.getAll().map((c) => c.name);
    const supabaseCookiePresent = cookieNames.some(
      (n) => n.startsWith("sb-") && n.includes("auth")
    );

    let user = null as Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"];

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
      });
      const res = NextResponse.json(
        { error: "Sessão inválida ou expirada." },
        { status: 401 }
      );
      return applyAuthCookies(res, authCookieWrites);
    }

    if (user.id !== userId) {
      logStructured("warn", "api.checkout.create_session.user_id_mismatch", {});
      const res = NextResponse.json(
        { error: "Usuário não autorizado para esta operação." },
        { status: 403 }
      );
      return applyAuthCookies(res, authCookieWrites);
    }

    let admin;
    try {
      admin = requireAdminSupabaseClient();
    } catch (err) {
      logStructured("error", "api.checkout.create_session.admin_client", {
        message: err instanceof Error ? err.message : String(err),
      });
      const res = NextResponse.json(
        { error: "Configuração do servidor incompleta." },
        { status: 500 }
      );
      return applyAuthCookies(res, authCookieWrites);
    }

    const result = await createSubscriptionCheckoutSession(admin, {
      userId: user.id,
      userEmail: user.email,
      priceId,
      slug,
      restaurantName: restaurantNameResolved,
      whatsapp: typeof whatsapp === "string" ? whatsapp : undefined,
    });

    if (!result.ok) {
      const res = NextResponse.json({ error: result.error }, { status: result.status });
      return applyAuthCookies(res, authCookieWrites);
    }

    const res = NextResponse.json({ url: result.url });
    return applyAuthCookies(res, authCookieWrites);
  } catch (err) {
    logStructured("error", "api.checkout.create_session.unexpected", {
      message: err instanceof Error ? err.message : String(err),
    });
    const res = NextResponse.json(
      { error: "Erro interno ao criar sessão de checkout." },
      { status: 500 }
    );
    return applyAuthCookies(res, authCookieWrites);
  }
}
