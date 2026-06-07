"use client";

import { IosToggle } from "@/components/ui/IosToggle";
import {
  DIAS_AGENDA,
  type DiaAgendaKey,
  type FuncionamentoSemana,
} from "@/lib/restaurante/funcionamento-semana";

const PADRAO_ABERTURA = "18:00";
const PADRAO_FECHAMENTO = "23:00";

export function FuncionamentoSemanalForm(props: {
  value: FuncionamentoSemana;
  onChange: (next: FuncionamentoSemana) => void;
}) {
  const { value, onChange } = props;

  const patchDia = (key: DiaAgendaKey, patch: Partial<FuncionamentoSemana[DiaAgendaKey]>) => {
    onChange({ ...value, [key]: { ...value[key], ...patch } });
  };

  const setDiaAberto = (key: DiaAgendaKey, aberto: boolean) => {
    if (aberto) {
      const atual = value[key];
      const faixa = atual.faixas[0] ?? { abertura: PADRAO_ABERTURA, fechamento: PADRAO_FECHAMENTO };
      patchDia(key, {
        ativo: true,
        faixas: [{ abertura: faixa.abertura || PADRAO_ABERTURA, fechamento: faixa.fechamento || PADRAO_FECHAMENTO }],
      });
    } else {
      patchDia(key, { ativo: false });
    }
  };

  const timeInputClass =
    "rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm tabular-nums text-zinc-900 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-zinc-900 disabled:cursor-not-allowed";

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Horário de funcionamento</p>
        <p className="mt-1 text-sm text-zinc-500">
          Defina por dia da semana. O cardápio público usa isso para orientar o cliente e pode limitar pedidos fora
          do expediente.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-0 border-b border-zinc-100 bg-zinc-50/80 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 sm:px-5">
          <span>Dia</span>
          <span className="text-center">Abre</span>
          <span className="text-right sm:pr-1">Horário</span>
        </div>
        <div className="divide-y divide-zinc-100">
          {DIAS_AGENDA.map(({ key, labelLong }) => {
            const dia = value[key];
            const faixa = dia.faixas[0] ?? { abertura: PADRAO_ABERTURA, fechamento: PADRAO_FECHAMENTO };
            const aberto = dia.ativo;
            return (
              <div
                key={key}
                className="grid grid-cols-1 items-center gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto_1fr] sm:gap-x-4 sm:px-5"
              >
                <p className="font-medium text-zinc-900">{labelLong}</p>
                <div className="flex items-center justify-start gap-3 sm:justify-center">
                  <IosToggle
                    tone="success"
                    checked={aberto}
                    onChange={(v) => setDiaAberto(key, v)}
                    aria-label={aberto ? `${labelLong}: aberto` : `${labelLong}: fechado`}
                  />
                  <span className="text-sm text-zinc-500 sm:hidden">{aberto ? "Aberto" : "Fechado"}</span>
                </div>
                <div
                  className={[
                    "flex flex-wrap items-center justify-end gap-2 sm:gap-3",
                    aberto ? "" : "pointer-events-none opacity-40",
                  ].join(" ")}
                >
                  <input
                    type="time"
                    disabled={!aberto}
                    value={faixa.abertura}
                    onChange={(e) => {
                      patchDia(key, {
                        faixas: [{ abertura: e.target.value, fechamento: faixa.fechamento }],
                      });
                    }}
                    className={timeInputClass}
                  />
                  <span className="text-xs font-medium text-zinc-400">até</span>
                  <input
                    type="time"
                    disabled={!aberto}
                    value={faixa.fechamento}
                    onChange={(e) => {
                      patchDia(key, {
                        faixas: [{ abertura: faixa.abertura, fechamento: e.target.value }],
                      });
                    }}
                    className={timeInputClass}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Os horários são salvos em formato estruturado (JSON) no banco. O resumo continua visível para o cliente na
        vitrine.
      </p>
    </div>
  );
}
