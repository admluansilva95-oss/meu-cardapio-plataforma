"use client";

import { useEffect } from "react";
import { extractPublicSlugFromPathname } from "@/lib/telemetry/extract-public-slug-from-path";
import { reportClientErrorToTelemetry } from "@/lib/telemetry/client-error-report";
import "./globals.css";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    const href = typeof window !== "undefined" ? window.location.href : "";
    const path = typeof window !== "undefined" ? window.location.pathname : "";
    const slug = extractPublicSlugFromPathname(path);
    const message = String(error?.message ?? "Erro desconhecido").slice(0, 500);
    void reportClientErrorToTelemetry({
      message,
      digest: error.digest,
      url: href.slice(0, 2000),
      slug,
    });
  }, [error]);

  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-zinc-950 font-sans text-zinc-100 antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
          <div className="mx-auto max-w-md text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500">
              Cardápio
            </p>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
              Erro crítico na aplicação
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-zinc-400">
              Tente recarregar a página. Se o problema continuar, volte mais tarde.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              className="mt-10 inline-flex min-h-[48px] min-w-[220px] items-center justify-center rounded-full bg-white px-8 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200"
            >
              Recarregar página
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
