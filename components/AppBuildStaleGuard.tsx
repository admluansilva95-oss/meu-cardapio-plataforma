"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { fetchAppApiResilient, parseAppApiJsonResponse } from "@/lib/http/fetch-app-api";

/**
 * Se o HTML/JS em cache for de outro deploy, `NEXT_PUBLIC_BUILD_ID` (empacotado no bundle)
 * diverge do valor atual servido pela API — força reload automático (sem pedir Ctrl+F5).
 */
export function AppBuildStaleGuard({ children }: { children: ReactNode }) {
  const reloaded = useRef(false);

  useEffect(() => {
    const clientBuild = process.env.NEXT_PUBLIC_BUILD_ID?.trim();
    if (!clientBuild || clientBuild === "unknown") return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchAppApiResilient("/api/build-info", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const parsed = await parseAppApiJsonResponse<{ buildId?: string }>(res);
        if (!parsed.ok) return;
        const body = parsed.data;
        const serverBuild = body.buildId?.trim();
        if (!serverBuild || serverBuild === "unknown" || serverBuild === clientBuild) return;
        if (reloaded.current) return;
        reloaded.current = true;
        window.location.reload();
      } catch {
        /* rede: não recarregar em loop */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return <>{children}</>;
}
