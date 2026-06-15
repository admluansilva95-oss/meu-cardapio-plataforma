import { NextResponse, type NextRequest } from "next/server";

/**
 * Alias do tutorial oficial Supabase (`/auth/confirm?token_hash=…`).
 * O fluxo de sessão e cookies vive em `app/auth/callback/route.ts` (`/auth/callback`).
 *
 * Sem esta rota, o link do e-mail (ou o template por omissão do dashboard) pode apontar para
 * um caminho inexistente e o utilizador vê JSON do tipo `requested path is invalid`.
 */
export function GET(request: NextRequest) {
  const url = new URL(`/auth/callback${request.nextUrl.search}`, request.url);
  return NextResponse.redirect(url);
}
