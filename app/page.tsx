"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simula autenticação — em produção substitua por chamada real à API / Supabase.
    setTimeout(() => {
      setLoading(false);
      const slug = tenantSlug.trim();
      router.push(slug ? `/admin?slug=${encodeURIComponent(slug)}` : "/admin");
    }, 450);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07080c] text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_600px_at_20%_-10%,rgba(45,212,191,0.18),transparent_55%),radial-gradient(900px_500px_at_100%_0%,rgba(99,102,241,0.16),transparent_50%),radial-gradient(800px_400px_at_50%_120%,rgba(244,244,245,0.06),transparent_45%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.04),transparent_35%,rgba(0,0,0,0.35))]"
      />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-6 py-16">
        <div className="mb-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-teal-300/90">
            Painel do restaurante
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Entrar com segurança
          </h1>
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
            </div>
          </div>
          <p className="mt-8 text-center text-xs text-zinc-600">
            Dica: esta tela é independente — toda a lógica do login vive apenas neste arquivo.
          </p>
        </div>
      </div>
    </div>
  );
}
