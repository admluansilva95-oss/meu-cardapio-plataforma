/** Agenda semanal estruturada (JSON no Supabase — formato v2: open / from / to por dia). */

export const DIAS_AGENDA = [
  { key: "seg" as const, short: "Seg", label: "Segunda", labelLong: "Segunda-feira" },
  { key: "ter" as const, short: "Ter", label: "Terça", labelLong: "Terça-feira" },
  { key: "qua" as const, short: "Qua", label: "Quarta", labelLong: "Quarta-feira" },
  { key: "qui" as const, short: "Qui", label: "Quinta", labelLong: "Quinta-feira" },
  { key: "sex" as const, short: "Sex", label: "Sexta", labelLong: "Sexta-feira" },
  { key: "sab" as const, short: "Sáb", label: "Sábado", labelLong: "Sábado" },
  { key: "dom" as const, short: "Dom", label: "Domingo", labelLong: "Domingo" },
] as const;

export type DiaAgendaKey = (typeof DIAS_AGENDA)[number]["key"];

export type FaixaHorario = { abertura: string; fechamento: string };

export type DiaOperacao = { ativo: boolean; faixas: FaixaHorario[] };

export type FuncionamentoSemana = Record<DiaAgendaKey, DiaOperacao>;

/** Formato persistido preferencial (legível e estável no JSONB). */
export type DiaFuncionamentoJsonV2 = { open: boolean; from: string; to: string };

export type FuncionamentoSemanaJsonV2 = Record<DiaAgendaKey, DiaFuncionamentoJsonV2>;

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

function isDiaV2(v: unknown): v is DiaFuncionamentoJsonV2 {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.open === "boolean" &&
    typeof o.from === "string" &&
    typeof o.to === "string"
  );
}

function padHhMm(s: string): string {
  const t = s.trim().slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(t)) return t;
  return "18:00";
}

/**
 * Fuso civil usado para comparar a agenda (horários do painel) na vitrine e na API de pedidos.
 * Sem isso, o servidor (UTC) e o navegador no Brasil divergem em “aberto/fechado”.
 */
export const FUSO_HORARIO_AGENDA_VITRINE = "America/Sao_Paulo";

const WEEKDAY_EN_SHORT_TO_DIA: Record<string, DiaAgendaKey> = {
  sun: "dom",
  mon: "seg",
  tue: "ter",
  wed: "qua",
  thu: "qui",
  fri: "sex",
  sat: "sab",
};

/** Dia da agenda + HH:mm civis no fuso informado (padrão: Brasil). */
export function diaEHoraCivisNaAgenda(
  instant: Date,
  timeZone: string = FUSO_HORARIO_AGENDA_VITRINE,
): { diaKey: DiaAgendaKey; hhmm: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  let wdRaw = "";
  let hh = "00";
  let mm = "00";
  for (const p of parts) {
    if (p.type === "weekday") wdRaw = p.value;
    else if (p.type === "hour") hh = p.value;
    else if (p.type === "minute") mm = p.value;
  }
  const wd = wdRaw
    .replace(/\.$/, "")
    .trim()
    .slice(0, 3)
    .toLowerCase();
  const diaKey = WEEKDAY_EN_SHORT_TO_DIA[wd] ?? "dom";
  return { diaKey, hhmm: `${hh.padStart(2, "0")}:${mm.padStart(2, "0")}` };
}

export function criarFuncionamentoSemanaVazio(): FuncionamentoSemana {
  const base: Partial<FuncionamentoSemana> = {};
  for (const { key } of DIAS_AGENDA) {
    base[key] = { ativo: false, faixas: [{ abertura: "18:00", fechamento: "23:00" }] };
  }
  return base as FuncionamentoSemana;
}

/** Converte modelo interno (ativo + faixas) para JSON v2 no banco. */
export function serializarFuncionamentoSemanaParaV2(f: FuncionamentoSemana): FuncionamentoSemanaJsonV2 {
  const out = {} as FuncionamentoSemanaJsonV2;
  for (const { key } of DIAS_AGENDA) {
    const d = f[key];
    const faixa = d.faixas[0] ?? { abertura: "18:00", fechamento: "23:00" };
    out[key] = {
      open: d.ativo,
      from: padHhMm(faixa.abertura),
      to: padHhMm(faixa.fechamento),
    };
  }
  return out;
}

/** Preferência v2; se algum dia tiver mais de um turno, mantém o objeto legado (ativo + faixas) para não perder dados. */
export function serializarFuncionamentoSemanaParaJson(
  f: FuncionamentoSemana,
): FuncionamentoSemanaJsonV2 | FuncionamentoSemana {
  if (DIAS_AGENDA.some(({ key }) => (f[key].faixas?.length ?? 0) > 1)) {
    return f;
  }
  return serializarFuncionamentoSemanaParaV2(f);
}

export function parseFuncionamentoSemana(raw: unknown): FuncionamentoSemana | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const out = criarFuncionamentoSemanaVazio();
  let ok = false;
  for (const { key } of DIAS_AGENDA) {
    const d = o[key];
    if (isDiaV2(d)) {
      ok = true;
      const from = padHhMm(d.from);
      const to = padHhMm(d.to);
      out[key] = {
        ativo: d.open,
        faixas: d.open ? [{ abertura: from, fechamento: to }] : [{ abertura: from, fechamento: to }],
      };
      continue;
    }
    if (isDiaOperacao(d)) {
      ok = true;
      const faixas = d.faixas.filter((f) => f.abertura && f.fechamento).length
        ? d.faixas.map((f) => ({ abertura: f.abertura.slice(0, 5), fechamento: f.fechamento.slice(0, 5) }))
        : [{ abertura: "18:00", fechamento: "23:00" }];
      out[key] = { ativo: d.ativo, faixas };
    }
  }
  return ok ? out : null;
}

/** Há ao menos um dia marcado como “abre” — usado para decidir se aplicamos bloqueio por relógio na vitrine. */
export function agendaTemDiaAberto(f: FuncionamentoSemana | null | undefined): boolean {
  if (!f) return false;
  return DIAS_AGENDA.some(({ key }) => f[key]?.ativo === true);
}

/** Índice getDay(): 0=dom … 6=sab → chave da agenda. */
export function diaAgendaKeyFromDate(date: Date): DiaAgendaKey {
  const n = date.getDay();
  const order: DiaAgendaKey[] = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
  return order[n] ?? "dom";
}

/** Considera turnos do dia no fuso {@link FUSO_HORARIO_AGENDA_VITRINE} (mesma regra na vitrine e na API). */
export function estaAbertoNoHorarioLocal(f: FuncionamentoSemana, quando: Date = new Date()): boolean {
  const { diaKey: key, hhmm: hm } = diaEHoraCivisNaAgenda(quando);
  const d = f[key];
  if (!d?.ativo || !d.faixas?.length) return false;
  return d.faixas.some(({ abertura, fechamento }) => {
    const a = padHhMm(abertura);
    const b = padHhMm(fechamento);
    return hm >= a && hm <= b;
  });
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

function minutosDesdeMeiaNoiteHhMm(hm: string): number {
  const [hStr, mStr] = padHhMm(hm).split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function labelDiaAberturaRelativo(offsetDias: number, key: DiaAgendaKey): string {
  if (offsetDias === 0) return "hoje";
  if (offsetDias === 1) return "amanhã";
  const meta = DIAS_AGENDA.find((x) => x.key === key);
  return meta?.labelLong ?? key;
}

/**
 * Quando a loja está fechada pelo relógio (agenda ativa), descreve a próxima abertura em pt-BR.
 * Ex.: "Abre hoje às 18h", "Abre amanhã às 11h30", "Abre Terça-feira às 11h30".
 * Retorna `null` se não há agenda, se já está aberto, ou se não há próximo turno nos 7 dias.
 */
export function proximaAberturaTextoPt(f: FuncionamentoSemana, agora: Date = new Date()): string | null {
  if (!agendaTemDiaAberto(f)) return null;
  if (estaAbertoNoHorarioLocal(f, agora)) return null;

  const startMin = minutosDesdeMeiaNoiteHhMm(diaEHoraCivisNaAgenda(agora).hhmm);

  for (let offset = 0; offset < 7; offset++) {
    const t = new Date(agora.getTime() + offset * 86400000);
    const key = diaEHoraCivisNaAgenda(t).diaKey;
    const dia = f[key];
    if (!dia?.ativo || !dia.faixas?.length) continue;

    const faixas = [...dia.faixas].sort(
      (a, b) => minutosDesdeMeiaNoiteHhMm(a.abertura) - minutosDesdeMeiaNoiteHhMm(b.abertura),
    );

    if (offset === 0) {
      for (const fa of faixas) {
        const ab = minutosDesdeMeiaNoiteHhMm(fa.abertura);
        const fe = minutosDesdeMeiaNoiteHhMm(fa.fechamento);
        if (startMin < ab) {
          return `Abre ${labelDiaAberturaRelativo(0, key)} às ${formatarHoraCurta(fa.abertura)}`;
        }
        if (startMin >= ab && startMin <= fe) return null;
      }
      continue;
    }

    const fa0 = faixas[0];
    return `Abre ${labelDiaAberturaRelativo(offset, key)} às ${formatarHoraCurta(fa0.abertura)}`;
  }

  return null;
}

export function formatFuncionamentoResumo(f: FuncionamentoSemana | null): string {
  if (!f) return "";
  const partes: string[] = [];
  for (const { key, short } of DIAS_AGENDA) {
    const d = f[key];
    if (!d?.ativo || !d.faixas?.length) continue;
    const faixasTxt = d.faixas
      .map((fa) => `${formatarHoraCurta(fa.abertura)}-${formatarHoraCurta(fa.fechamento)}`)
      .join(", ");
    partes.push(`${short}: ${faixasTxt}`);
  }
  const fechados = DIAS_AGENDA.filter(({ key }) => !f[key]?.ativo).map((x) => x.short);
  if (fechados.length && fechados.length < 7) {
    partes.push(`Fechado: ${fechados.join(", ")}`);
  }
  return partes.join(" | ");
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
