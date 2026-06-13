"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { extractPublicSlugFromPathname } from "@/lib/telemetry/extract-public-slug-from-path";
import { reportClientErrorToTelemetry } from "@/lib/telemetry/client-error-report";

type AppErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AppError({ error, reset }: AppErrorProps) {
  const pathname = usePathname() ?? "";

  useEffect(() => {
    const url =
      typeof window !== "undefined"
        ? String(window.location.href).slice(0, 2000)
        : "";
    const slug = extractPublicSlugFromPathname(pathname);
    const message = String(error?.message ?? "Erro desconhecido").slice(0, 500);
    void reportClientErrorToTelemetry({
      message,
      digest: error.digest,
      url,
      slug,
    });
  }, [error, pathname]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center bg-zinc-50 px-6 py-16 text-zinc-900">
      <div className="mx-auto max-w-md text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500">Cardápio</p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          Algo saiu do esperado
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-zinc-600">
          Ocorreu um erro nesta página. Você pode tentar recarregar ou voltar ao início.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex min-h-[44px] min-w-[200px] items-center justify-center rounded-full bg-zinc-900 px-8 py-3 text-sm font-semibold text-white transition hover:bg-black"
          >
            Recarregar página
          </button>
          <Link
            href="/"
            className="inline-flex min-h-[44px] min-w-[200px] items-center justify-center rounded-full border border-zinc-300 bg-white px-8 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
          >
            Ir ao início
          </Link>
        </div>
      </div>
    </div>
  );
}
