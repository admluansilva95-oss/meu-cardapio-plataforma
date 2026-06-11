import type { ReactNode } from "react";
import type { Restaurante } from "@/types";
import { statusAberturaPorRelogio } from "@/lib/restaurante/horario-vitrine";

export type EstabelecimentoStatusBadgeProps = {
  restaurante: Restaurante;
  className?: string;
};

/**
 * Status da vitrine + agenda: aberta recebendo pedidos (verde + pulse) vs fechada.
 */
export function EstabelecimentoStatusBadge({ restaurante, className = "" }: EstabelecimentoStatusBadgeProps) {
  const manualFechada = restaurante.vitrine_fechada === true;
  const relogio = statusAberturaPorRelogio(restaurante, new Date());
  const foraDoHorario = relogio === "fechado";
  const aoVivo = !manualFechada && !foraDoHorario;

  const shell = (tone: string, inner: ReactNode, pulse?: boolean) => (
    <div
      className={[
        "flex min-w-0 max-w-full items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 shadow-md sm:max-w-[22rem] sm:px-4",
        tone,
        pulse ? "motion-safe:animate-pulse" : "",
        className,
      ].join(" ")}
    >
      {inner}
    </div>
  );

  if (aoVivo) {
    return shell(
      "border-emerald-300/90 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/80 ring-2 ring-emerald-400/35",
      <>
        <span className="relative flex h-3.5 w-3.5 shrink-0" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-55" />
          <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.28)]" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-900/85">Aberta</p>
          <p className="truncate text-sm font-semibold leading-snug text-emerald-950">Recebendo pedidos</p>
        </div>
      </>,
      true,
    );
  }

  if (manualFechada) {
    return shell(
      "border-rose-200/90 bg-gradient-to-br from-rose-50 to-white shadow-sm",
      <>
        <span
          className="h-3.5 w-3.5 shrink-0 rounded-full bg-rose-500 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.35)]"
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-800/90">Fechada</p>
          <p className="truncate text-sm font-semibold leading-snug text-rose-950">Vitrine pausada</p>
        </div>
      </>,
    );
  }

  return shell(
    "border-zinc-300/90 bg-gradient-to-br from-zinc-100 to-white shadow-sm",
    <>
      <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-zinc-400 ring-2 ring-zinc-200" aria-hidden />
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">Fechada</p>
        <p className="truncate text-sm font-semibold leading-snug text-zinc-800">Fora do horário</p>
      </div>
    </>,
  );
}
