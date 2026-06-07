"use client";

import {
  DIAS_AGENDA,
  type FuncionamentoSemana,
} from "@/lib/restaurante/funcionamento-semana";

export function FuncionamentoSemanalForm(props: {
  value: FuncionamentoSemana;
  onChange: (next: FuncionamentoSemana) => void;
}) {
  const { value, onChange } = props;

  const patchDia = (key: keyof FuncionamentoSemana, patch: Partial<FuncionamentoSemana[keyof FuncionamentoSemana]>) => {
    onChange({ ...value, [key]: { ...value[key], ...patch } });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-[#86868b]">
          Funcionamento semanal
        </label>
      </div>
      <div className="divide-y divide-black/[0.06] overflow-hidden rounded-xl border border-black/[0.08] bg-[#fafafa]">
        {DIAS_AGENDA.map(({ key, label, short }) => {
          const dia = value[key];
          return (
            <div key={key} className="bg-white px-3 py-3 sm:px-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <label className="flex cursor-pointer items-center gap-2.5 sm:min-w-[8.5rem]">
                  <input
                    type="checkbox"
                    checked={dia.ativo}
                    onChange={(e) => patchDia(key, { ativo: e.target.checked })}
                    className="h-4 w-4 rounded border-black/20 text-[#1d1d1f]"
                  />
                  <span className="text-sm font-medium text-[#1d1d1f]">
                    {short}
                    <span className="ml-1 font-normal text-[#86868b]">· {label}</span>
                  </span>
                </label>
                {dia.ativo ? (
                  <div className="flex min-w-0 flex-1 flex-col gap-2 sm:items-end">
                    {dia.faixas.map((faixa, idx) => (
                      <div
                        key={`${key}-${idx}`}
                        className="flex flex-wrap items-center gap-2 sm:justify-end"
                      >
                        <input
                          type="time"
                          value={faixa.abertura}
                          onChange={(e) => {
                            const faixas = [...dia.faixas];
                            faixas[idx] = { ...faixa, abertura: e.target.value };
                            patchDia(key, { faixas });
                          }}
                          className="rounded-lg border border-black/[0.08] bg-[#fafafa] px-2 py-1.5 text-sm tabular-nums text-[#1d1d1f] outline-none focus:border-[#0071e3]/40"
                        />
                        <span className="text-xs text-[#86868b]">até</span>
                        <input
                          type="time"
                          value={faixa.fechamento}
                          onChange={(e) => {
                            const faixas = [...dia.faixas];
                            faixas[idx] = { ...faixa, fechamento: e.target.value };
                            patchDia(key, { faixas });
                          }}
                          className="rounded-lg border border-black/[0.08] bg-[#fafafa] px-2 py-1.5 text-sm tabular-nums text-[#1d1d1f] outline-none focus:border-[#0071e3]/40"
                        />
                        {dia.faixas.length > 1 ? (
                          <button
                            type="button"
                            onClick={() =>
                              patchDia(key, {
                                faixas: dia.faixas.filter((_, j) => j !== idx),
                              })
                            }
                            className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            Remover turno
                          </button>
                        ) : null}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        patchDia(key, {
                          faixas: [...dia.faixas, { abertura: "18:00", fechamento: "23:00" }],
                        })
                      }
                      className="self-start rounded-lg px-2 py-1 text-xs font-semibold text-[#0071e3] hover:bg-[#0071e3]/8 sm:self-end"
                    >
                      + Turno
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-[#aeaeb2] sm:text-right">Fechado</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] leading-relaxed text-[#86868b]">
        O cliente vê isso resumido no cardápio público. Você pode ter dois turnos no mesmo dia (ex.: almoço e jantar).
      </p>
    </div>
  );
}
