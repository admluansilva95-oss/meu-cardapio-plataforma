import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCorTema } from "@/lib/restaurante/cor-tema";
import {
  type FuncionamentoSemana,
  type FuncionamentoSemanaJsonV2,
  serializarFuncionamentoSemanaParaJson,
  validarFuncionamentoSemana,
} from "@/lib/restaurante/funcionamento-semana";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { TaxaEntregaZona } from "@/lib/restaurante/taxas-entrega-zonas";
import { validarTaxasZonas } from "@/lib/restaurante/taxas-entrega-zonas";
import {
  parseCardapioCategorias,
  validarCardapioCategorias,
} from "@/lib/restaurante/cardapio-categorias";

export const dynamic = "force-dynamic";

type CookieToSet = { name: string; value: string; options: CookieOptions };

function applyAuthCookies(target: NextResponse, writes: CookieToSet[]) {
  writes.forEach(({ name, value, options }) => {
    target.cookies.set(name, value, options);
  });
  return target;
}

type ConfigBody = {
  restauranteId?: string;
  nome?: string;
  whatsapp?: string;
  cor_tema?: string;
  /** URL pública (Storage) ou null para remover. */
  logo?: string | null;
  horario_funcionamento?: string | null;
  taxa_entrega?: number | null;
  vitrine_fechada?: boolean;
  mensagem_fechado?: string | null;
  funcionamento_semana?: FuncionamentoSemana;
  taxas_entrega_zonas?: TaxaEntregaZona[] | null;
  cardapio_categorias?: string[] | null;
  retirada_balcao?: boolean;
  entrega_modo?: "fixa" | "zonas";
  mensagem_boas_vindas?: string | null;
  texto_vitrine_aberto?: string | null;
  texto_vitrine_fechado?: string | null;
  mensagem_fora_horario?: string | null;
};

const MIGRATION_HINT =
  "Parte dos dados não foi gravada no banco (colunas em falta). No SQL Editor do Supabase, execute em ordem as migrações: 20260622120000_ensure_restaurantes_horario_funcionamento.sql (coluna horario_funcionamento), 20260608120000_restaurantes_tenant_settings.sql, 20260610120000_restaurantes_vitrine_fechada.sql, 20260611120000_restaurantes_funcionamento_taxas_json.sql, 20260614120000_restaurantes_entrega_categorias.sql, 20260615120000_restaurantes_vitrine_textos.sql, 20260607140000_storage_restaurant_logos.sql, 20260621120000_storage_imagens_pratos_bucket.sql (buckets de Storage). Nome, WhatsApp e cor já foram salvos.";

function isSchemaColumnError(err: { message?: string; code?: string; details?: string } | null): boolean {
  if (!err) return false;
  const blob = [err.message, err.details, err.code].filter(Boolean).join(" ").toLowerCase();
  if (blob.includes("42703") || blob.includes("schema cache")) return true;
  if (blob.includes("does not exist")) return true;
  if (blob.includes("column") && blob.includes("could not find")) return true;
  return false;
}

function isRlsError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("row-level security") ||
    m.includes("42501") ||
    m.includes("permission denied") ||
    m.includes("violates row-level security")
  );
}

async function runUpdate(
  client: SupabaseClient,
  opts: { id: string; ownerFilter: string | null },
  payload: Record<string, unknown>,
) {
  let q = client.from("restaurantes").update(payload).eq("id", opts.id);
  if (opts.ownerFilter) {
    q = q.eq("owner_id", opts.ownerFilter);
  }
  return q.select("id");
}

type Interpret =
  | { ok: true }
  | { ok: false; message: string; code?: "rls" | "other" };

function interpretUpdate(
  res: Awaited<ReturnType<typeof runUpdate>>,
): Interpret {
  const { data, error } = res;
  if (error) {
    return {
      ok: false,
      message: error.message,
      code: isRlsError(error.message) ? "rls" : "other",
    };
  }
  if (!data?.length) {
    return {
      ok: false,
      message:
        "Nenhuma linha foi atualizada (permissão negada ou restaurante inexistente). Verifique se você é o dono do estabelecimento.",
      code: "rls",
    };
  }
  return { ok: true };
}

async function applyLegacyExtras(
  client: SupabaseClient,
  opts: { id: string; ownerFilter: string | null },
  extras: {
    horario_funcionamento: string | null;
    taxa_entrega: number | null;
    vitrine_fechada: boolean;
    mensagem_fechado: string | null;
    mensagem_boas_vindas: string | null;
    texto_vitrine_aberto?: string | null;
    texto_vitrine_fechado?: string | null;
    mensagem_fora_horario?: string | null;
  },
): Promise<{ ok: true; skipped?: boolean } | { ok: false; message: string; code?: "rls" | "other" }> {
  const payload: Record<string, unknown> = {
    horario_funcionamento: extras.horario_funcionamento,
    taxa_entrega: extras.taxa_entrega,
    vitrine_fechada: extras.vitrine_fechada,
    mensagem_fechado: extras.mensagem_fechado,
    mensagem_boas_vindas: extras.mensagem_boas_vindas,
  };
  if ("texto_vitrine_aberto" in extras) payload.texto_vitrine_aberto = extras.texto_vitrine_aberto;
  if ("texto_vitrine_fechado" in extras) payload.texto_vitrine_fechado = extras.texto_vitrine_fechado;
  if ("mensagem_fora_horario" in extras) payload.mensagem_fora_horario = extras.mensagem_fora_horario;
  const res = await runUpdate(client, opts, payload);
  if (!res.error) {
    const r = interpretUpdate(res);
    if (r.ok) return { ok: true };
    return r;
  }
  if (isSchemaColumnError(res.error)) {
    return { ok: true, skipped: true };
  }
  return interpretUpdate(res);
}

async function applyJsonExtras(
  client: SupabaseClient,
  opts: { id: string; ownerFilter: string | null },
  extras: {
    funcionamento_semana: FuncionamentoSemanaJsonV2 | FuncionamentoSemana;
    taxas_entrega_zonas: TaxaEntregaZona[] | null;
    cardapio_categorias: string[];
    retirada_balcao: boolean;
    entrega_modo: "fixa" | "zonas";
  },
): Promise<{ ok: true; skipped?: boolean } | { ok: false; message: string; code?: "rls" | "other" }> {
  /** Valores JSON-serializáveis — o cliente Supabase persiste em colunas `jsonb` sem `JSON.stringify` manual. */
  const payload: Record<string, unknown> = {
    funcionamento_semana: extras.funcionamento_semana,
    taxas_entrega_zonas: extras.taxas_entrega_zonas,
    cardapio_categorias: extras.cardapio_categorias,
    retirada_balcao: extras.retirada_balcao,
    entrega_modo: extras.entrega_modo,
  };
  const res = await runUpdate(client, opts, payload);
  if (!res.error) {
    const r = interpretUpdate(res);
    if (r.ok) return { ok: true };
    return r;
  }
  if (isSchemaColumnError(res.error)) {
    return { ok: true, skipped: true };
  }
  return interpretUpdate(res);
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const sessionResponse = NextResponse.next({
    request: { headers: request.headers },
  });
  const authCookieWrites: CookieToSet[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            sessionResponse.cookies.set(name, value, options);
            try {
              cookieStore.set(name, value, options);
            } catch {
              /* Route Handler: cookieStore.set pode falhar */
            }
            authCookieWrites.push({ name, value, options });
          });
        },
      },
    },
  );

  const authHeader = request.headers.get("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  let user = null as Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"];

  if (bearerToken) {
    const {
      data: { user: u },
      error: e,
    } = await supabase.auth.getUser(bearerToken);
    if (!e && u) user = u;
  }
  if (!user) {
    const {
      data: { user: u },
      error: e,
    } = await supabase.auth.getUser();
    if (!e && u) user = u;
  }

  if (!user) {
    const res = NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    return applyAuthCookies(res, authCookieWrites);
  }

  let body: ConfigBody;
  try {
    body = (await request.json()) as ConfigBody;
  } catch {
    const res = NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
    return applyAuthCookies(res, authCookieWrites);
  }

  const restauranteId = typeof body.restauranteId === "string" ? body.restauranteId.trim() : "";
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const whatsapp = typeof body.whatsapp === "string" ? body.whatsapp.trim() : "";
  const corRaw = typeof body.cor_tema === "string" ? body.cor_tema : "#0d9488";
  const horario =
    body.horario_funcionamento === null || body.horario_funcionamento === undefined
      ? null
      : String(body.horario_funcionamento).trim() || null;
  const taxa =
    body.taxa_entrega === null || body.taxa_entrega === undefined || Number.isNaN(body.taxa_entrega)
      ? null
      : Math.max(0, Math.round(Number(body.taxa_entrega) * 100) / 100);
  const vitrineFechada = body.vitrine_fechada === true;
  const mensagemFechadoRaw =
    typeof body.mensagem_fechado === "string" ? body.mensagem_fechado.trim().slice(0, 400) : "";
  const mensagem_fechado = vitrineFechada && mensagemFechadoRaw.length > 0 ? mensagemFechadoRaw : null;

  const normTxt = (v: unknown, max: number) =>
    typeof v === "string" ? v.trim().slice(0, max) || null : null;
  const mensagem_boas_vindas = normTxt(body.mensagem_boas_vindas, 500);

  const legacyVitrineOpcional: {
    texto_vitrine_aberto?: string | null;
    texto_vitrine_fechado?: string | null;
    mensagem_fora_horario?: string | null;
  } = {};
  if ("texto_vitrine_aberto" in body) {
    legacyVitrineOpcional.texto_vitrine_aberto = normTxt(body.texto_vitrine_aberto, 200);
  }
  if ("texto_vitrine_fechado" in body) {
    legacyVitrineOpcional.texto_vitrine_fechado = normTxt(body.texto_vitrine_fechado, 200);
  }
  if ("mensagem_fora_horario" in body) {
    legacyVitrineOpcional.mensagem_fora_horario = normTxt(body.mensagem_fora_horario, 400);
  }

  const funcionamento_semana = body.funcionamento_semana;
  const taxasBody = body.taxas_entrega_zonas;
  const taxas_zonas = Array.isArray(taxasBody)
    ? (taxasBody as TaxaEntregaZona[]).map((z) => ({
        id: String(z.id ?? ""),
        nome: String(z.nome ?? "").trim(),
        valor: Math.max(0, Math.round(Number(z.valor) * 100) / 100) || 0,
      }))
    : null;

  if (!restauranteId) {
    const res = NextResponse.json({ error: "restauranteId é obrigatório." }, { status: 400 });
    return applyAuthCookies(res, authCookieWrites);
  }
  if (nome.length < 2) {
    const res = NextResponse.json(
      { error: "Informe o nome do estabelecimento (mínimo 2 caracteres)." },
      { status: 400 },
    );
    return applyAuthCookies(res, authCookieWrites);
  }
  if (!whatsapp) {
    const res = NextResponse.json({ error: "Informe o WhatsApp." }, { status: 400 });
    return applyAuthCookies(res, authCookieWrites);
  }

  if (!funcionamento_semana || typeof funcionamento_semana !== "object") {
    const res = NextResponse.json({ error: "Dados de funcionamento semanal inválidos." }, { status: 400 });
    return applyAuthCookies(res, authCookieWrites);
  }
  const errF = validarFuncionamentoSemana(funcionamento_semana);
  if (errF) {
    const res = NextResponse.json({ error: errF }, { status: 400 });
    return applyAuthCookies(res, authCookieWrites);
  }
  const funcionamentoSemanaGravar: FuncionamentoSemana = funcionamento_semana;
  const funcionamentoJsonGravar = serializarFuncionamentoSemanaParaJson(funcionamentoSemanaGravar);
  const listaZonas = taxas_zonas ?? [];
  const errZ = validarTaxasZonas(listaZonas);
  if (errZ) {
    const res = NextResponse.json({ error: errZ }, { status: 400 });
    return applyAuthCookies(res, authCookieWrites);
  }

  const cardapio_categorias = Array.isArray(body.cardapio_categorias)
    ? body.cardapio_categorias.map((x) => String(x ?? "").trim()).filter(Boolean)
    : parseCardapioCategorias(body.cardapio_categorias);
  const errC = validarCardapioCategorias(cardapio_categorias);
  if (errC) {
    const res = NextResponse.json({ error: errC }, { status: 400 });
    return applyAuthCookies(res, authCookieWrites);
  }

  const entrega_modo = body.entrega_modo === "zonas" ? "zonas" : "fixa";
  if (entrega_modo === "zonas" && listaZonas.length === 0) {
    const res = NextResponse.json(
      { error: "Em taxas por bairro, adicione ao menos uma região com nome e valor." },
      { status: 400 },
    );
    return applyAuthCookies(res, authCookieWrites);
  }

  const retirada_balcao = body.retirada_balcao === true;

  const cor_tema = normalizeCorTema(corRaw);

  let logoGravar: string | null | undefined = undefined;
  if (body.logo !== undefined) {
    if (body.logo === null) {
      logoGravar = null;
    } else if (typeof body.logo !== "string") {
      const res = NextResponse.json({ error: "Campo logo inválido." }, { status: 400 });
      return applyAuthCookies(res, authCookieWrites);
    } else {
      const t = body.logo.trim();
      if (!t) {
        logoGravar = null;
      } else if (t.length > 2500) {
        const res = NextResponse.json({ error: "URL do logo muito longa." }, { status: 400 });
        return applyAuthCookies(res, authCookieWrites);
      } else if (!/^https?:\/\//i.test(t)) {
        const res = NextResponse.json(
          { error: "A URL do logo deve começar com http:// ou https://." },
          { status: 400 },
        );
        return applyAuthCookies(res, authCookieWrites);
      } else {
        logoGravar = t;
      }
    }
  }

  const base: Record<string, unknown> = { nome, whatsapp, cor_tema };
  if (logoGravar !== undefined) {
    base.logo = logoGravar;
  }
  const legacyExtras = {
    horario_funcionamento: horario,
    taxa_entrega: taxa,
    vitrine_fechada: vitrineFechada,
    mensagem_fechado: vitrineFechada ? mensagem_fechado : null,
    mensagem_boas_vindas,
    ...legacyVitrineOpcional,
  };

  const jsonZonas = listaZonas.length > 0 ? listaZonas : null;

  const admin = createAdminSupabaseClient();

  async function runAll(client: SupabaseClient, ownerFilter: string | null) {
    let q = client.from("restaurantes").update(base).eq("id", restauranteId);
    if (ownerFilter) q = q.eq("owner_id", ownerFilter);
    const baseRes = await q.select("id");
    const r0 = interpretUpdate(baseRes);
    if (!r0.ok) return { error: r0.message, code: r0.code } as const;

    const r1 = await applyLegacyExtras(client, { id: restauranteId, ownerFilter }, legacyExtras);
    if (!r1.ok) return { error: r1.message, code: r1.code } as const;

    const r2 = await applyJsonExtras(client, { id: restauranteId, ownerFilter }, {
      funcionamento_semana: funcionamentoJsonGravar,
      taxas_entrega_zonas: jsonZonas,
      cardapio_categorias,
      retirada_balcao,
      entrega_modo,
    });
    if (!r2.ok) return { error: r2.message, code: r2.code } as const;

    const partial = Boolean(r1.skipped || r2.skipped);
    return { partial } as const;
  }

  if (admin) {
    const { data: row, error: selErr } = await admin
      .from("restaurantes")
      .select("id, owner_id")
      .eq("id", restauranteId)
      .maybeSingle();

    if (selErr) {
      const res = NextResponse.json({ error: selErr.message }, { status: 500 });
      return applyAuthCookies(res, authCookieWrites);
    }
    if (!row) {
      const res = NextResponse.json({ error: "Restaurante não encontrado." }, { status: 404 });
      return applyAuthCookies(res, authCookieWrites);
    }
    if (row.owner_id !== user.id) {
      const res = NextResponse.json(
        { error: "Você não tem permissão para alterar este restaurante." },
        { status: 403 },
      );
      return applyAuthCookies(res, authCookieWrites);
    }

    const out = await runAll(admin, null);
    if ("error" in out) {
      const res = NextResponse.json(
        { error: out.error },
        { status: out.code === "rls" ? 403 : 500 },
      );
      return applyAuthCookies(res, authCookieWrites);
    }
    const res = NextResponse.json({
      ok: true,
      ...(out.partial ? { warning: MIGRATION_HINT } : {}),
    });
    return applyAuthCookies(res, authCookieWrites);
  }

  const out = await runAll(supabase, user.id);
  if ("error" in out) {
    const hint =
      out.code === "rls"
        ? " Ative a política RLS de UPDATE para donos em `restaurantes` ou configure SUPABASE_SERVICE_ROLE_KEY no servidor (ex.: Vercel)."
        : "";
    const res = NextResponse.json(
      { error: `${out.error}.${hint}` },
      { status: out.code === "rls" ? 403 : 500 },
    );
    return applyAuthCookies(res, authCookieWrites);
  }

  const res = NextResponse.json({
    ok: true,
    ...(out.partial ? { warning: MIGRATION_HINT } : {}),
  });
  return applyAuthCookies(res, authCookieWrites);
}
