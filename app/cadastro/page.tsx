import { Suspense } from "react";
import { PLANS } from "@/lib/plans";
import { CadastroForm } from "./cadastro-form";

/** Evita HTML estático sem query string: useSearchParams precisa bater com o SSR. */
export const dynamic = "force-dynamic";

export default function CadastroPage() {
  /** Mesmo valor no SSR e no primeiro render do cliente (evita divergência de `priceId` por env em módulos). */
  const defaultEssencialPriceId = PLANS[0].priceId;

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#07080c] text-zinc-400">
          Carregando…
        </div>
      }
    >
      <CadastroForm defaultEssencialPriceId={defaultEssencialPriceId} />
    </Suspense>
  );
}
