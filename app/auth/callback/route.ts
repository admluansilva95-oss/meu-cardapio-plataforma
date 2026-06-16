import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getOwnerAuthStorageOptions,
  getSupabaseServerCookieOptions,
} from "@/lib/auth/supabase-session-cookies";
import { getPublicAppUrl } from "@/lib/site-url";
import { latin1CookieWrite } from "@/lib/http/byte-string-http";
import { serverLatin1SafeFetch } from "@/lib/http/server-latin1-fetch";
import { getPublicSupabaseProjectUrl } from "@/lib/supabase/normalize-public-supabase-url";

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

function decodeNextSearchParam(raw: string | null): string | null {
  if (raw == null) return null;
  let s = raw.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!s) return null;
  for (let i = 0; i < 4; i++) {
    try {
      const dec = decodeURIComponent(s);
      if (dec === s) break;
      s = dec.trim();
    } catch {
      break;
    }
  }
  return s || null;
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

function loginPathAfterEmailConfirm(nextPath: string): string {
  const params = new URLSearchParams({
    email_confirmed: "1",
    next: nextPath,
  });
  return `/login?${params.toString()}`;
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

  const nextPath = safeInternalPath(decodeNextSearchParam(searchParams.get("next")));
  const redirectUrl = new URL(loginPathAfterEmailConfirm(nextPath), origin);

  // Uma única instância de redirect: `setAll` pode ser chamado várias vezes
  // (ex.: limpar PKCE e depois gravar a sessão). Recriar NextResponse.redirect
  // a cada chamada descarta Set-Cookie da resposta anterior → sessão incompleta.
  const response = NextResponse.redirect(redirectUrl);

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
            response.cookies.set(name, value, options);
          });
        },
      },
      global: { fetch: serverLatin1SafeFetch },
    }
  );

  const token_hash = searchParams.get("token_hash");
  const otpTypeRaw = searchParams.get("type");
  const code = searchParams.get("code");

  if (token_hash && otpTypeRaw && isEmailOtpType(otpTypeRaw)) {
    try {
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
    } catch (unexpected: unknown) {
      const errLogin = new URL("/login", origin);
      errLogin.searchParams.set("error", "auth_callback");
      errLogin.searchParams.set(
        "message",
        unexpected instanceof Error ? unexpected.message : "Falha ao confirmar o e-mail.",
      );
      return NextResponse.redirect(errLogin);
    }
  }

  if (code) {
    try {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        const errLogin = new URL("/login", origin);
        errLogin.searchParams.set("error", "auth_callback");
        errLogin.searchParams.set("message", exchangeError.message);
        return NextResponse.redirect(errLogin);
      }

      return response;
    } catch (unexpected: unknown) {
      const errLogin = new URL("/login", origin);
      errLogin.searchParams.set("error", "auth_callback");
      errLogin.searchParams.set(
        "message",
        unexpected instanceof Error ? unexpected.message : "Falha ao criar sessão.",
      );
      return NextResponse.redirect(errLogin);
    }
  }

  loginUrl.searchParams.set("error", "missing_auth_code");
  loginUrl.searchParams.set(
    "error_description",
    "Link inválido ou incompleto. Confira o template de e-mail no Supabase (token_hash) ou solicite um novo link."
  );
  return NextResponse.redirect(loginUrl);
}
