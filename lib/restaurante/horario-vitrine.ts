import type { Restaurante } from "@/types";
import {
  DIAS_AGENDA,
  type DiaAgendaKey,
  agendaTemDiaAberto,
  estaAbertoNoHorarioLocal,
  formatFuncionamentoResumo,
  formatarHoraCurta,
  type FuncionamentoSemana,
} from "./funcionamento-semana";

/** Texto único para exibir na vitrine (JSON estruturado ou legado). */
export function textoHorarioVitrine(restaurante: Restaurante): string {
  const fromJson = restaurante.funcionamento_semana
    ? formatFuncionamentoResumo(restaurante.funcionamento_semana)
    : "";
  if (fromJson.trim()) return fromJson.trim();
  return restaurante.horario_funcionamento?.trim() ?? "";
}

/** Bloco compacto: dias consecutivos com o mesmo horário (ex.: Ter–Dom). */
export type VitrineHorarioBloco = { labelDias: string; detalhe: string };

export type VitrineHorarioExibicao =
  | { modo: "blocos"; blocos: VitrineHorarioBloco[] }
  | { modo: "livre"; texto: string };

function formatFaixasDia(f: FuncionamentoSemana, key: DiaAgendaKey): string {
  const d = f[key];
  if (!d?.ativo || !d.faixas?.length) return "Fechado";
  return d.faixas
    .map((fa) => `${formatarHoraCurta(fa.abertura)}–${formatarHoraCurta(fa.fechamento)}`)
    .join(", ");
}

function labelIntervaloDias(shorts: string[]): string {
  if (shorts.length === 0) return "";
  if (shorts.length === 1) return shorts[0];
  return `${shorts[0]}–${shorts[shorts.length - 1]}`;
}

/** Agrupa dias seguidos (Seg→Dom) com o mesmo texto de horário. */
function blocosAgrupadosDaAgenda(f: FuncionamentoSemana): VitrineHorarioBloco[] {
  const porDia = DIAS_AGENDA.map(({ key, short }) => ({
    short,
    detalhe: formatFaixasDia(f, key),
  }));
  const blocos: VitrineHorarioBloco[] = [];
  let run: typeof porDia = [];
  const flush = () => {
    if (!run.length) return;
    blocos.push({
      labelDias: labelIntervaloDias(run.map((r) => r.short)),
      detalhe: run[0].detalhe,
    });
    run = [];
  };
  for (const item of porDia) {
    if (run.length && run[0].detalhe !== item.detalhe) flush();
    run.push(item);
  }
  flush();
  return blocos;
}

/**
 * Horários para a vitrine: poucas linhas quando a agenda é JSON (dias iguais agrupados),
 * ou um parágrafo curto no modo livre (separadores "|" viram "·").
 */
export function vitrineHorarioExibicao(restaurante: Restaurante): VitrineHorarioExibicao | null {
  const f = restaurante.funcionamento_semana;
  const fromJson = f ? formatFuncionamentoResumo(f).trim() : "";
  if (f && fromJson) {
    return { modo: "blocos", blocos: blocosAgrupadosDaAgenda(f) };
  }

  const raw = restaurante.horario_funcionamento?.trim();
  if (!raw) return null;
  const texto = raw.includes("|")
    ? raw
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" · ")
    : raw;
  return { modo: "livre", texto };
}

/** Com agenda ativa no JSON: indica se o relógio local cai dentro de algum turno hoje. */
export function statusAberturaPorRelogio(
  restaurante: Restaurante,
  agora: Date = new Date(),
): "sem_agenda" | "aberto" | "fechado" {
  const f = restaurante.funcionamento_semana;
  if (!f || !agendaTemDiaAberto(f)) return "sem_agenda";
  return estaAbertoNoHorarioLocal(f, agora) ? "aberto" : "fechado";
}
