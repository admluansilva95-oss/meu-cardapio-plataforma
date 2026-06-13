import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isValidSlug } from "@/lib/billing/slug";
import { latin1CookieWrite } from "@/lib/http/byte-string-http";
import { nextResponseWithByteStringSafeWire } from "@/lib/http/next-response-wire-safe";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/** Última camada: cabeçalhos + statusText Latin-1 / ASCII antes de sair do middleware. */
function out(res: NextResponse): NextResponse {
  return nextResponseWithByteStringSafeWire(res);
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

  const { data: assinaturasValidas, error: assinaturasError } = await supabase
    .from("assinaturas")
    .select("id")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing"])
    .limit(1);

  if (assinaturasError) {
    console.error("[proxy/admin] assinaturas:", assinaturasError.message);
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
      console.error("[proxy/admin] slug tenant:", alvoErr.message);
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
      console.error("[proxy/admin] meu restaurante:", meuErr.message);
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
    console.error("[proxy/admin] restaurantes:", error.message);
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
