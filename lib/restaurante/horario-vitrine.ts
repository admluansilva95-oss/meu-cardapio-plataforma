import type { Restaurante } from "@/types";
import {
  agendaTemDiaAberto,
  estaAbertoNoHorarioLocal,
  formatFuncionamentoResumo,
} from "./funcionamento-semana";

/** Texto único para exibir na vitrine (JSON estruturado ou legado). */
export function textoHorarioVitrine(restaurante: Restaurante): string {
  const fromJson = restaurante.funcionamento_semana
    ? formatFuncionamentoResumo(restaurante.funcionamento_semana)
    : "";
  if (fromJson.trim()) return fromJson.trim();
  return restaurante.horario_funcionamento?.trim() ?? "";
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
