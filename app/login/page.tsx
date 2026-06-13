"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
} from "@/lib/auth/supabase-browser-auth-safe";
import { devClientError } from "@/lib/logging/dev-client-log";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const priceId = searchParams.get("priceId") ?? "";
  const signupPending = searchParams.get("signup") === "1";
  const nextParam = searchParams.get("next")?.trim() ?? "";
  const authError = searchParams.get("error");
  const authErrorDetail =
    searchParams.get("error_description") ?? searchParams.get("message");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        router.replace(redirectAfterLogin);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, redirectAfterLogin]);

  async function submitLogin() {
    setLoading(true);
    setErrorMessage(null);

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
        setErrorMessage(mensagemErroSupabaseAuthAmigavel(error.message, error.code));
        return;
      }

      if (data.session) {
        try {
          router.push(redirectAfterLogin);
        } catch (navErr) {
          devClientError("[login] router.push:", navErr);
          window.location.assign(redirectAfterLogin);
        }
        return;
      }

      setErrorMessage(
        "Não foi possível obter sessão após validar os dados. Se acabou de confirmar o e-mail, aguarde um minuto e tente novamente.",
      );
    } catch (err) {
      devClientError("[login] handleSubmit:", err);
      setErrorMessage(mensagemFalhaAutenticacaoResidual("login"));
    } finally {
      setLoading(false);
    }
  }

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
              type="submit"
              data-testid="login-submit"
              disabled={loading}
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
