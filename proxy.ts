import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isValidSlug } from "@/lib/billing/slug";
import {
  getOwnerAuthStorageOptions,
  getSupabaseServerCookieOptions,
} from "@/lib/auth/supabase-session-cookies";
import { getPublicSupabaseProjectUrl } from "@/lib/supabase/normalize-public-supabase-url";
import { latin1CookieWrite } from "@/lib/http/byte-string-http";
import { nextResponseWithByteStringSafeWire } from "@/lib/http/next-response-wire-safe";
import { serverLatin1SafeFetch } from "@/lib/http/server-latin1-fetch";
import { logStructured } from "@/lib/logging/structured-log";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/** Última camada: cabeçalhos + statusText Latin-1 / ASCII antes de sair do middleware. */
function out(res: NextResponse): NextResponse {
  return nextResponseWithByteStringSafeWire(res);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type PostgrestLikeError = {
  message?: string;
  code?: string;
  details?: string;
};

/**
 * Erros frequentemente transitórios na consulta a `assinaturas` (rede, cold start, timeout).
 * Não inclui RLS nem “tabela inexistente” — esses não devem ser mascarados com retry infinito.
 */
function isTransientAssinaturaQueryError(err: PostgrestLikeError): boolean {
  const m = (err.message ?? "").toLowerCase();
  const c = (err.code ?? "").toLowerCase();
  if (m.includes("timeout") || m.includes("timed out")) return true;
  if (m.includes("fetch failed") || m.includes("failed to fetch")) return true;
  if (m.includes("network")) return true;
  if (m.includes("econnreset") || m.includes("econnrefused") || m.includes("etimedout")) return true;
  if (m.includes("socket") && (m.includes("hang") || m.includes("closed"))) return true;
  if (m.includes("503") || m.includes("502") || m.includes("504")) return true;
  if (c === "08006" || c === "08003" || c === "57p01") return true;
  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname !== "/admin") {
    return out(NextResponse.next());
  }

  // Uma única instância: `setAll` pode ser chamado várias vezes (ex.: refresh).
  // Recriar `NextResponse.next` a cada chamada descarta Set-Cookie anteriores.
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    getPublicSupabaseProjectUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: getSupabaseServerCookieOptions(),
      ...getOwnerAuthStorageOptions(),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach((raw) => {
            const { name, value, options } = latin1CookieWrite(raw);
            // 1. Atualiza a requisição para que os Server Components adiante vejam o cookie novo imediatamente
            request.cookies.set(name, value);

            // 2. Atualiza a resposta para salvar o cookie de forma definitiva no navegador do usuário
            response.cookies.set(name, value, options);
          });
        },
      },
      global: { fetch: serverLatin1SafeFetch },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    const nextPath = `${pathname}${request.nextUrl.search}`;
    login.searchParams.set("next", nextPath);
    return out(NextResponse.redirect(login));
  }

  const maxAttempts = 3;
  const backoffMs = [0, 200, 500];
  let assinaturasValidas: { id: string }[] | null = null;
  let assinaturasError: PostgrestLikeError | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const wait = backoffMs[attempt] ?? 0;
    if (wait > 0) {
      await sleep(wait);
    }
    const res = await supabase
      .from("assinaturas")
      .select("id")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing"])
      .limit(1);
    assinaturasValidas = res.data;
    assinaturasError = res.error as PostgrestLikeError | null;

    if (!assinaturasError) {
      if (attempt > 0) {
        logStructured("info", "proxy.admin.assinaturas.recovered_after_retry", {
          attempt: attempt + 1,
          userIdSuffix: user.id.slice(-8),
        });
      }
      break;
    }

    const transient = isTransientAssinaturaQueryError(assinaturasError);
    logStructured(transient ? "warn" : "error", "proxy.admin.assinaturas.attempt", {
      attempt: attempt + 1,
      maxAttempts,
      code: assinaturasError.code ?? null,
      transient,
      userIdSuffix: user.id.slice(-8),
    });

    if (!transient || attempt === maxAttempts - 1) {
      break;
    }
  }

  if (assinaturasError) {
    logStructured("error", "proxy.admin.assinaturas.final_failure", {
      code: assinaturasError.code ?? null,
      transient: isTransientAssinaturaQueryError(assinaturasError),
      userIdSuffix: user.id.slice(-8),
    });
    /** Falha fechada: não liberar o painel se não for possível verificar assinatura (evita bypass por erro transitório). */
    const fallback = request.nextUrl.clone();
    fallback.pathname = "/login";
    fallback.search = "";
    fallback.searchParams.set("error", "billing_check");
    fallback.searchParams.set(
      "error_description",
      "Não foi possível verificar sua assinatura. Tente novamente em instantes ou entre em contato com o suporte.",
    );
    return out(NextResponse.redirect(fallback));
  }

  // Stripe success_url: /admin?checkout=success&success=true — libera acesso antes do
  // webhook gravar `assinaturas` (evita loop /cadastro?billing=required). Só `checkout`
  // é obrigatório aqui; `success=true` é opcional (UX / analytics).
  const checkoutSuccess = searchParams.get("checkout") === "success";

  if (!assinaturasValidas?.length && !checkoutSuccess) {
    const cadastro = request.nextUrl.clone();
    cadastro.pathname = "/cadastro";
    cadastro.search = "";
    cadastro.searchParams.set("billing", "required");
    return out(NextResponse.redirect(cadastro));
  }

  const slugParam = searchParams.get("slug")?.trim();
  if (slugParam) {
    if (!isValidSlug(slugParam)) {
      const url = request.nextUrl.clone();
      url.searchParams.delete("slug");
      return out(NextResponse.redirect(url));
    }

    const { data: alvo, error: alvoErr } = await supabase
      .from("restaurantes")
      .select("owner_id")
      .eq("slug", slugParam)
      .maybeSingle();

    if (alvoErr) {
      logStructured("error", "proxy.admin.slug_tenant", { code: alvoErr.code ?? null });
      const url = request.nextUrl.clone();
      url.searchParams.delete("slug");
      return out(NextResponse.redirect(url));
    }

    if (alvo?.owner_id === user.id) {
      return out(response);
    }

    const url = request.nextUrl.clone();
    url.searchParams.delete("slug");
    const { data: meu, error: meuErr } = await supabase
      .from("restaurantes")
      .select("slug")
      .eq("owner_id", user.id)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (meuErr) {
      logStructured("error", "proxy.admin.meu_restaurante", { code: meuErr.code ?? null });
      return out(NextResponse.redirect(url));
    }
    if (meu?.slug) {
      url.searchParams.set("slug", meu.slug);
    }
    return out(NextResponse.redirect(url));
  }

  const envSlug = process.env.NEXT_PUBLIC_ADMIN_RESTAURANT_SLUG?.trim();
  if (envSlug) {
    const url = request.nextUrl.clone();
    url.searchParams.set("slug", envSlug);
    return out(NextResponse.redirect(url));
  }

  const { data: restaurante, error } = await supabase
    .from("restaurantes")
    .select("slug")
    .eq("owner_id", user.id)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logStructured("error", "proxy.admin.restaurantes", { code: error.code ?? null });
    return out(response);
  }

  if (restaurante?.slug) {
    const url = request.nextUrl.clone();
    url.searchParams.set("slug", restaurante.slug);
    return out(NextResponse.redirect(url));
  }

  return out(response);
}

export const config = {
  matcher: ["/admin"],
};
