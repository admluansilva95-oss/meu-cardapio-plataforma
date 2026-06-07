/** Agenda semanal estruturada (JSON no Supabase). */

export const DIAS_AGENDA = [
  { key: "seg" as const, short: "Seg", label: "Segunda" },
  { key: "ter" as const, short: "Ter", label: "Terça" },
  { key: "qua" as const, short: "Qua", label: "Quarta" },
  { key: "qui" as const, short: "Qui", label: "Quinta" },
  { key: "sex" as const, short: "Sex", label: "Sexta" },
  { key: "sab" as const, short: "Sáb", label: "Sábado" },
  { key: "dom" as const, short: "Dom", label: "Domingo" },
] as const;

export type DiaAgendaKey = (typeof DIAS_AGENDA)[number]["key"];

export type FaixaHorario = { abertura: string; fechamento: string };

export type DiaOperacao = { ativo: boolean; faixas: FaixaHorario[] };

export type FuncionamentoSemana = Record<DiaAgendaKey, DiaOperacao>;

function isFaixa(v: unknown): v is FaixaHorario {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.abertura === "string" && typeof o.fechamento === "string";
}

function isDiaOperacao(v: unknown): v is DiaOperacao {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.ativo !== "boolean" || !Array.isArray(o.faixas)) return false;
  return o.faixas.every(isFaixa);
}

export function criarFuncionamentoSemanaVazio(): FuncionamentoSemana {
  const base: Partial<FuncionamentoSemana> = {};
  for (const { key } of DIAS_AGENDA) {
    base[key] = { ativo: false, faixas: [{ abertura: "11:00", fechamento: "15:00" }] };
  }
  return base as FuncionamentoSemana;
}

export function parseFuncionamentoSemana(raw: unknown): FuncionamentoSemana | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const out = criarFuncionamentoSemanaVazio();
  let ok = false;
  for (const { key } of DIAS_AGENDA) {
    const d = o[key];
    if (isDiaOperacao(d)) {
      ok = true;
      const faixas = d.faixas.filter((f) => f.abertura && f.fechamento).length
        ? d.faixas.map((f) => ({ abertura: f.abertura.slice(0, 5), fechamento: f.fechamento.slice(0, 5) }))
        : [{ abertura: "11:00", fechamento: "15:00" }];
      out[key] = { ativo: d.ativo, faixas };
    }
  }
  return ok ? out : null;
}

/** HH:mm → exibição curta pt-BR */
export function formatarHoraCurta(hm: string): string {
  const [hStr, mStr] = hm.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hm;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

export function formatFuncionamentoResumo(f: FuncionamentoSemana | null): string {
  if (!f) return "";
  const partes: string[] = [];
  for (const { key, short } of DIAS_AGENDA) {
    const d = f[key];
    if (!d?.ativo || !d.faixas?.length) continue;
    const faixasTxt = d.faixas
      .map((fa) => `${formatarHoraCurta(fa.abertura)}–${formatarHoraCurta(fa.fechamento)}`)
      .join(", ");
    partes.push(`${short}: ${faixasTxt}`);
  }
  const fechados = DIAS_AGENDA.filter(({ key }) => !f[key].ativo).map((x) => x.short);
  if (fechados.length && fechados.length < 7) {
    partes.push(`Fechado: ${fechados.join(", ")}`);
  }
  return partes.join(" · ");
}

/** Valida faixas no mesmo dia (sem virada de noite). */
export function validarFuncionamentoSemana(f: FuncionamentoSemana): string | null {
  for (const { key, label } of DIAS_AGENDA) {
    const d = f[key];
    if (!d.ativo) continue;
    if (!d.faixas.length) return `${label}: marque ao menos um horário ou desative o dia.`;
    for (let i = 0; i < d.faixas.length; i++) {
      const { abertura, fechamento } = d.faixas[i];
      if (!/^\d{2}:\d{2}$/.test(abertura) || !/^\d{2}:\d{2}$/.test(fechamento)) {
        return `${label}: use horários no formato 24h (ex.: 11:00).`;
      }
      if (abertura >= fechamento) {
        return `${label}: o fechamento deve ser depois da abertura em cada turno.`;
      }
    }
  }
  return null;
}
