import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicAppUrl } from "@/lib/site-url";

type CookieToSet = { name: string; value: string; options: CookieOptions };

type EmailOtpType =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "email";

const EMAIL_OTP_TYPES = new Set<string>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function isEmailOtpType(t: string): t is EmailOtpType {
  return EMAIL_OTP_TYPES.has(t);
}

function safeInternalPath(next: string | null): string {
  const fallback = "/assinar";
  if (!next?.trim()) return fallback;
  const trimmed = next.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }
  try {
    const u = new URL(trimmed);
    const app = new URL(getPublicAppUrl());
    if (u.origin !== app.origin) return fallback;
    return `${u.pathname}${u.search}`;
  } catch {
    return fallback;
  }
}

/**
 * Confirmação de e-mail:
 * - `token_hash` + `type` → verifyOtp (funciona em outro navegador/dispositivo; ver lib/auth/supabase-confirm-email.md)
 * - `code` → exchangeCodeForSession (PKCE; mesmo contexto do signUp)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const loginUrl = new URL("/login", origin);
  if (error) {
    loginUrl.searchParams.set("error", error);
    if (errorDescription) {
      loginUrl.searchParams.set("error_description", errorDescription);
    }
    return NextResponse.redirect(loginUrl);
  }

  const nextPath = safeInternalPath(searchParams.get("next"));
  const redirectUrl = new URL(nextPath, origin);

  let response = NextResponse.redirect(redirectUrl);

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
          response = NextResponse.redirect(redirectUrl);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const token_hash = searchParams.get("token_hash");
  const otpTypeRaw = searchParams.get("type");
  const code = searchParams.get("code");

  if (token_hash && otpTypeRaw && isEmailOtpType(otpTypeRaw)) {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      type: otpTypeRaw,
      token_hash,
    });

    if (verifyError) {
      const errLogin = new URL("/login", origin);
      errLogin.searchParams.set("error", "auth_callback");
      errLogin.searchParams.set("message", verifyError.message);
      return NextResponse.redirect(errLogin);
    }

    return response;
  }

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      const errLogin = new URL("/login", origin);
      errLogin.searchParams.set("error", "auth_callback");
      errLogin.searchParams.set("message", exchangeError.message);
      return NextResponse.redirect(errLogin);
    }

    return response;
  }

  loginUrl.searchParams.set("error", "missing_auth_code");
  loginUrl.searchParams.set(
    "error_description",
    "Link inválido ou incompleto. Confira o template de e-mail no Supabase (token_hash) ou solicite um novo link."
  );
  return NextResponse.redirect(loginUrl);
}
