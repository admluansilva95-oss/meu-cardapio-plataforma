"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { getPublicAppUrl } from "@/lib/site-url";
import {
  mensagemErroSupabaseAuthAmigavel,
  validarEmailCliente,
  validarSenhaCliente,
} from "@/lib/auth/validacao-credenciais";
import {
  authGetSessionSafe,
  authSignInWithPasswordSafe,
  isSupabaseBrowserEnvConfigured,
  mensagemFalhaAutenticacaoResidual,
  MENSAGEM_SUPABASE_ENV_AUSENTE,
  waitForOwnerSessionAfterSignIn,
} from "@/lib/auth/supabase-browser-auth-safe";
import { devClientError } from "@/lib/logging/dev-client-log";

function LoginForm() {
  const searchParams = useSearchParams();
  const priceId = searchParams.get("priceId") ?? "";
  const signupPending = searchParams.get("signup") === "1";
  const nextParam = searchParams.get("next")?.trim() ?? "";
  const authError = searchParams.get("error");
  const authErrorDetail =
    searchParams.get("error_description") ?? searchParams.get("message");
  const sessionReason = searchParams.get("reason")?.trim() ?? "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** Só em E2E: erro cru do GoTrue/SDK para o Playwright anexar ao falhanço (ver `login-error-raw`). */
  const [authErrorDebug, setAuthErrorDebug] = useState<string | null>(null);

  const safeNext = (() => {
    const t = nextParam.trim();
    if (!t) return null;
    if (t.startsWith("/") && !t.startsWith("//")) return t;
    try {
      const u = new URL(t);
      const app = new URL(getPublicAppUrl());
      if (u.origin !== app.origin) return null;
      return `${u.pathname}${u.search}`;
    } catch {
      return null;
    }
  })();

  const redirectAfterLogin = safeNext
    ? safeNext
    : priceId
      ? `/assinar?priceId=${encodeURIComponent(priceId)}`
      : "/admin";

  useEffect(() => {
    if (!isSupabaseBrowserEnvConfigured()) return;
    let cancelled = false;
    (async () => {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { session },
        error,
      } = await authGetSessionSafe(supabase);
      if (!cancelled && !error && session?.user) {
        /** Navegação completa: o `proxy` no próximo documento lê cookies antes do React hidratar. */
        window.location.replace(redirectAfterLogin);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [redirectAfterLogin]);

  async function submitLogin() {
    setLoading(true);
    setErrorMessage(null);
    setAuthErrorDebug(null);

    try {
      const emailVal = validarEmailCliente(email);
      if (!emailVal.ok) {
        setErrorMessage(emailVal.mensagem);
        return;
      }
      const senhaVal = validarSenhaCliente(password);
      if (!senhaVal.ok) {
        setErrorMessage(senhaVal.mensagem);
        return;
      }

      if (!isSupabaseBrowserEnvConfigured()) {
        setErrorMessage(MENSAGEM_SUPABASE_ENV_AUSENTE);
        return;
      }

      const supabase = createBrowserSupabaseClient();
      const { data, error } = await authSignInWithPasswordSafe(supabase, {
        email: emailVal.email,
        password,
      });

      if (error) {
        devClientError("[login] signInWithPassword:", error.message);
        if (process.env.NEXT_PUBLIC_PLAYWRIGHT_E2E === "1") {
          setAuthErrorDebug(
            JSON.stringify({
              message: error.message,
              code: error.code ?? null,
              status: (error as { status?: number }).status ?? null,
            }),
          );
        }
        setErrorMessage(mensagemErroSupabaseAuthAmigavel(error));
        return;
      }

      if (data.session) {
        const { error: syncErr } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        if (syncErr) {
          devClientError("[login] setSession após signIn:", syncErr.message);
        }
        const persisted = await waitForOwnerSessionAfterSignIn(supabase);
        if (!persisted) {
          devClientError("[login] sessão GoTrue não ficou visível em getSession após signIn");
          setErrorMessage(
            "A sessão não foi gravada a tempo neste dispositivo. Aguarde um instante e toque em Entrar de novo (sem recarregar a página).",
          );
          return;
        }
        window.location.assign(redirectAfterLogin);
        return;
      }

      setErrorMessage(
        "Não foi possível obter sessão após validar os dados. Se acabou de confirmar o e-mail, aguarde um minuto e tente novamente.",
      );
    } catch (err) {
      devClientError("[login] handleSubmit:", err);
      if (process.env.NEXT_PUBLIC_PLAYWRIGHT_E2E === "1") {
        setAuthErrorDebug(
          JSON.stringify({
            message: err instanceof Error ? err.message : String(err),
            code: null,
            status: null,
          }),
        );
      }
      setErrorMessage(mensagemFalhaAutenticacaoResidual("login"));
    } finally {
      setLoading(false);
<<<<<<< Updated upstream
    }
  }
=======
      const slug = tenantSlug.trim();
      router.push(slug ? `/admin?slug=${encodeURIComponent(slug)}` : "/admin");
    }, 450);
  };
>>>>>>> Stashed changes

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07080c] text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_600px_at_20%_-10%,rgba(45,212,191,0.18),transparent_55%),radial-gradient(900px_500px_at_100%_0%,rgba(99,102,241,0.16),transparent_50%)]"
      />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-teal-300/90">
            Painel do restaurante
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Entrar com segurança
          </h1>
<<<<<<< Updated upstream
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            {priceId
              ? "Faça login para continuar sua assinatura."
              : "Acesse o painel do seu cardápio digital."}
          </p>
        </div>

        {signupPending ? (
          <p className="mb-4 rounded-2xl border border-teal-500/30 bg-teal-500/10 px-4 py-3 text-center text-sm text-teal-100">
            Conta criada. Confirme o e-mail se o Supabase pediu, faça login abaixo e conclua o
            pagamento.
          </p>
        ) : null}

        {sessionReason === "session_expired" && !authError ? (
          <p className="mb-4 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-100">
            Sua sessão expirou ou foi encerrada. Entre novamente com e-mail e senha.
          </p>
        ) : null}

        {authError ? (
          <p className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-100">
            {authError === "billing_check"
              ? authErrorDetail ??
                "Não foi possível confirmar sua assinatura. Tente de novo em instantes."
              : authError === "otp_expired"
                ? "O link de confirmação expirou ou já foi usado. Peça um novo e-mail em “Esqueci a senha” ou cadastre-se de novo."
                : authErrorDetail ?? `Não foi possível concluir a autenticação (${authError}).`}
          </p>
        ) : null}

        <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-8 backdrop-blur-2xl">
          <form
            data-testid="login-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submitLogin();
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const t = e.target;
              if (!(t instanceof HTMLInputElement)) return;
              e.preventDefault();
              void submitLogin();
            }}
            className="space-y-5"
          >
            <div className="space-y-2">
              <label htmlFor="email" className="text-xs font-medium text-zinc-300">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-teal-400/35 focus:ring-4 focus:ring-teal-500/15"
              />
=======
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
            Informe o slug do restaurante (mesmo da URL pública) para abrir o painel já no tenant
            correto. A autenticação real pode ser ligada depois via Supabase Auth.
          </p>
        </div>

        <div className="w-full max-w-md">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-px shadow-[0_24px_80px_-32px_rgba(0,0,0,0.85)] backdrop-blur-2xl">
            <div className="rounded-[calc(1.5rem-1px)] bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-8 sm:p-9">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-xs font-medium text-zinc-300">
                    E-mail
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="voce@restaurante.com"
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none ring-teal-400/0 transition placeholder:text-zinc-600 focus:border-teal-400/35 focus:ring-4 focus:ring-teal-500/15"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="password" className="text-xs font-medium text-zinc-300">
                    Senha
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none ring-teal-400/0 transition placeholder:text-zinc-600 focus:border-teal-400/35 focus:ring-4 focus:ring-teal-500/15"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="tenant-slug" className="text-xs font-medium text-zinc-300">
                    Slug do restaurante (opcional)
                  </label>
                  <input
                    id="tenant-slug"
                    name="tenant-slug"
                    type="text"
                    autoComplete="off"
                    value={tenantSlug}
                    onChange={(e) => setTenantSlug(e.target.value)}
                    placeholder="ex.: meu-restaurante"
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none ring-teal-400/0 transition placeholder:text-zinc-600 focus:border-teal-400/35 focus:ring-4 focus:ring-teal-500/15"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="group relative mt-2 w-full overflow-hidden rounded-2xl bg-gradient-to-r from-teal-400 via-emerald-400 to-cyan-400 px-4 py-3.5 text-sm font-semibold text-zinc-950 shadow-[0_16px_40px_-18px_rgba(45,212,191,0.65)] transition hover:brightness-[1.03] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="relative z-10">{loading ? "Entrando…" : "Entrar"}</span>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 translate-y-full bg-white/25 opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100"
                  />
                </button>
              </form>
              <p className="mt-6 text-center text-[11px] leading-relaxed text-zinc-500">
                Ao continuar, você concorda com o uso deste ambiente apenas para gestão interna do
                cardápio.
              </p>
>>>>>>> Stashed changes
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-xs font-medium text-zinc-300">
                Senha
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-teal-400/35 focus:ring-4 focus:ring-teal-500/15"
              />
            </div>
            <button
              type="button"
              data-testid="login-submit"
              disabled={loading}
              onClick={() => void submitLogin()}
              className="w-full rounded-2xl bg-gradient-to-r from-teal-400 via-emerald-400 to-cyan-400 py-3.5 text-sm font-semibold text-zinc-950 disabled:opacity-60"
            >
              {loading ? "Entrando…" : priceId ? "Continuar para assinatura" : "Entrar"}
            </button>
          </form>

          <p
            className={`mt-4 min-h-[1.5rem] text-center text-sm ${errorMessage ? "text-red-300" : "text-transparent"}`}
            role={errorMessage ? "alert" : undefined}
            data-testid="login-error"
          >
            {errorMessage ?? ""}
          </p>
          {process.env.NEXT_PUBLIC_PLAYWRIGHT_E2E === "1" && authErrorDebug ? (
            <span data-testid="login-error-raw" className="sr-only">
              {authErrorDebug}
            </span>
          ) : null}

          <p className="mt-6 text-center text-sm text-zinc-500">
            Não tem conta?{" "}
            <Link
              href={priceId ? `/cadastro?priceId=${encodeURIComponent(priceId)}` : "/cadastro"}
              className="text-teal-300 hover:underline"
            >
              Criar conta
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center">
          <Link href="/" className="text-xs text-zinc-600 hover:text-zinc-400">
            Voltar para a página inicial
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#07080c] text-zinc-400">
          Carregando…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
