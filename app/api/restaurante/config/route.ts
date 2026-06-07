import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCorTema } from "@/lib/restaurante/cor-tema";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

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
  horario_funcionamento?: string | null;
  taxa_entrega?: number | null;
  vitrine_fechada?: boolean;
  mensagem_fechado?: string | null;
};

const MIGRATION_HINT =
  "Horário, taxa e aviso de fechado não foram gravados: faltam colunas no Supabase. No SQL Editor, execute em ordem: supabase/migrations/20260608120000_restaurantes_tenant_settings.sql e depois 20260610120000_restaurantes_vitrine_fechada.sql. Nome, WhatsApp e cor já foram salvos.";

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

async function updateRestauranteConfig(
  client: SupabaseClient,
  opts: { id: string; ownerFilter: string | null },
  base: Record<string, unknown>,
  extras: {
    horario_funcionamento: string | null;
    taxa_entrega: number | null;
    vitrine_fechada: boolean;
    mensagem_fechado: string | null;
  },
): Promise<
  { ok: true; extrasSkipped?: boolean } | { ok: false; message: string; code?: "rls" | "other" }
> {
  const run = async (payload: Record<string, unknown>) => {
    let q = client.from("restaurantes").update(payload).eq("id", opts.id);
    if (opts.ownerFilter) {
      q = q.eq("owner_id", opts.ownerFilter);
    }
    return q.select("id");
  };

  const interpret = (
    res: Awaited<ReturnType<typeof run>>,
  ): { ok: true } | { ok: false; message: string; code?: "rls" | "other" } => {
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
  };

  const baseRes = await run(base);
  const rBase = interpret(baseRes);
  if (!rBase.ok) return rBase;

  const extraPayload: Record<string, unknown> = {
    horario_funcionamento: extras.horario_funcionamento,
    taxa_entrega: extras.taxa_entrega,
    vitrine_fechada: extras.vitrine_fechada,
    mensagem_fechado: extras.mensagem_fechado,
  };

  const extraRes = await run(extraPayload);
  if (!extraRes.error) {
    const rExtra = interpret(extraRes);
    if (rExtra.ok) return { ok: true };
    return rExtra;
  }
  if (isSchemaColumnError(extraRes.error)) {
    return { ok: true, extrasSkipped: true };
  }
  return interpret(extraRes);
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

  const cor_tema = normalizeCorTema(corRaw);
  const base = { nome, whatsapp, cor_tema };
  const extras = {
    horario_funcionamento: horario,
    taxa_entrega: taxa,
    vitrine_fechada: vitrineFechada,
    mensagem_fechado: vitrineFechada ? mensagem_fechado : null,
  };

  const admin = createAdminSupabaseClient();

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

    const result = await updateRestauranteConfig(
      admin,
      { id: restauranteId, ownerFilter: null },
      base,
      extras,
    );
    if (!result.ok) {
      const res = NextResponse.json({ error: result.message }, { status: 500 });
      return applyAuthCookies(res, authCookieWrites);
    }
    const res = NextResponse.json({
      ok: true,
      ...(result.extrasSkipped ? { warning: MIGRATION_HINT } : {}),
    });
    return applyAuthCookies(res, authCookieWrites);
  }

  const result = await updateRestauranteConfig(
    supabase,
    { id: restauranteId, ownerFilter: user.id },
    base,
    extras,
  );

  if (!result.ok) {
    const hint =
      result.code === "rls"
        ? " Ative a política RLS de UPDATE para donos em `restaurantes` ou configure SUPABASE_SERVICE_ROLE_KEY no servidor (ex.: Vercel)."
        : "";
    const res = NextResponse.json(
      { error: `${result.message}.${hint}` },
      { status: result.code === "rls" ? 403 : 500 },
    );
    return applyAuthCookies(res, authCookieWrites);
  }

  const res = NextResponse.json({
    ok: true,
    ...(result.extrasSkipped ? { warning: MIGRATION_HINT } : {}),
  });
  return applyAuthCookies(res, authCookieWrites);
}
