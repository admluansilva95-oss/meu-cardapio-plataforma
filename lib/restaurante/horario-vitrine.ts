import type { Restaurante } from "@/types";
import { formatFuncionamentoResumo } from "./funcionamento-semana";

/** Texto único para exibir na vitrine (JSON estruturado ou legado). */
export function textoHorarioVitrine(restaurante: Restaurante): string {
  const fromJson = restaurante.funcionamento_semana
    ? formatFuncionamentoResumo(restaurante.funcionamento_semana)
    : "";
  if (fromJson.trim()) return fromJson.trim();
  return restaurante.horario_funcionamento?.trim() ?? "";
}
