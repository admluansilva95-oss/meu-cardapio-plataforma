import { Suspense } from "react";
import { CadastroForm } from "./cadastro-form";

/** Evita HTML estático sem query string: useSearchParams precisa bater com o SSR. */
export const dynamic = "force-dynamic";

export default function CadastroPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#07080c] text-zinc-400">
          Carregando…
        </div>
      }
    >
      <CadastroForm />
    </Suspense>
  );
}
