import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { latin1CookieWrite } from "@/lib/http/byte-string-http";

export const dynamic = "force-dynamic";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Diagnósticos leves para o painel admin (somente usuário autenticado).
 * Não expõe segredos — apenas se variáveis críticas estão definidas no servidor.
 */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();

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
            request.cookies.set(name, value);
            try {
              cookieStore.set(name, value, options);
            } catch {
              /* ignore */
            }
          });
        },
      },
    },
  );

  const authHeader = request.headers.get("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

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
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const serviceRoleConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

  return NextResponse.json({
    ok: true,
    supabaseServiceRoleConfigured: serviceRoleConfigured,
  });
}
