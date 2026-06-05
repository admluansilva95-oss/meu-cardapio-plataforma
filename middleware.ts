import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname !== "/admin") {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    const nextPath = `${pathname}${request.nextUrl.search}`;
    login.searchParams.set("next", nextPath);
    return NextResponse.redirect(login);
  }

  const { data: assinaturasValidas, error: assinaturasError } = await supabase
    .from("assinaturas")
    .select("id")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing"])
    .limit(1);

  if (assinaturasError) {
    console.error("[middleware/admin] assinaturas:", assinaturasError.message);
    return response;
  }

  const checkoutSuccess = searchParams.get("checkout") === "success";

  if (!assinaturasValidas?.length && !checkoutSuccess) {
    const cadastro = request.nextUrl.clone();
    cadastro.pathname = "/cadastro";
    cadastro.search = "";
    cadastro.searchParams.set("billing", "required");
    return NextResponse.redirect(cadastro);
  }

  const slugParam = searchParams.get("slug")?.trim();
  if (slugParam) {
    return response;
  }

  const envSlug = process.env.NEXT_PUBLIC_ADMIN_RESTAURANT_SLUG?.trim();
  if (envSlug) {
    const url = request.nextUrl.clone();
    url.searchParams.set("slug", envSlug);
    return NextResponse.redirect(url);
  }

  const { data: restaurante, error } = await supabase
    .from("restaurantes")
    .select("slug")
    .eq("owner_id", user.id)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[middleware/admin] restaurantes:", error.message);
    return response;
  }

  if (restaurante?.slug) {
    const url = request.nextUrl.clone();
    url.searchParams.set("slug", restaurante.slug);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/admin"],
};
