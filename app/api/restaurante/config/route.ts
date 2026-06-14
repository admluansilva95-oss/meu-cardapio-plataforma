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
import {
  sanitizeDbJsonDeep,
  sanitizeDbPlainText,
  sanitizeDbPlainTextNullable,
} from "@/lib/db/sanitize-persist";
import {
  getOwnerAuthStorageOptions,
  getSupabaseServerCookieOptions,
} from "@/lib/auth/supabase-session-cookies";
import { latin1CookieWrite } from "@/lib/http/byte-string-http";
import { serverLatin1SafeFetch } from "@/lib/http/server-latin1-fetch";
import { logStructured } from "@/lib/logging/structured-log";
import { jsonWithRequestId } from "@/lib/http/json-with-request-id";
import { runApiWithAccessLog } from "@/lib/http/run-api-with-access-log";

export const dynamic = "force-dynamic";

type CookieToSet = { name: string; value: string; options: CookieOptions };

function applyAuthCookies(target: NextResponse, writes: CookieToSet[]) {
  writes.forEach((raw) => {
    const { name, value, options } = latin1CookieWrite(raw);
    target.cookies.set(name, value, options);
  });
  return target;
}

function jsonCfg(
  requestId: string,
  body: Record<string, unknown>,
  status: number,
  authCookieWrites: CookieToSet[],
): NextResponse {
  return applyAuthCookies(jsonWithRequestId(requestId, body, status), authCookieWrites);
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
  /** Optimistic lock: deve coincidir com `restaurantes.config_version` atual. */
  configVersion?: number;
};

const MIGRATION_HINT =
  "Parte dos dados não foi gravada no banco (colunas em falta). No SQL Editor do Supabase, execute em ordem as migrações: 20260622120000_ensure_restaurantes_horario_funcionamento.sql (coluna horario_funcionamento), 20260608120000_restaurantes_tenant_settings.sql, 20260610120000_restaurantes_vitrine_fechada.sql, 20260611120000_restaurantes_funcionamento_taxas_json.sql, 20260614120000_restaurantes_entrega_categorias.sql, 20260615120000_restaurantes_vitrine_textos.sql, 20260607140000_storage_restaurant_logos.sql, 20260621120000_storage_imagens_pratos_bucket.sql (buckets de Storage). Nome, WhatsApp e cor já foram salvos.";

function isSchemaColumnError(
  err: { message?: string; code?: string; details?: string } | null,
): boolean {
  if (!err) return false;
  const blob = [err.message, err.details, err.code]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (blob.includes("42703") || blob.includes("schema cache")) return true;
  if (blob.includes("does not exist")) return true;
  if (blob.includes("column") && blob.includes("could not find")) return true;
  return false;
}

function isRlsError(message: unknown): boolean {
  const m = String(message ?? "").toLowerCase();
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
    const msg = String(error.message ?? "");
    return {
      ok: false,
      message: msg || "Erro ao atualizar dados no servidor.",
      code: isRlsError(msg) ? "rls" : "other",
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
): Promise<
  | { ok: true; skipped?: boolean }
  | { ok: false; message: string; code?: "rls" | "other" }
> {
  const payload: Record<string, unknown> = {
    horario_funcionamento: extras.horario_funcionamento,
    taxa_entrega: extras.taxa_entrega,
    vitrine_fechada: extras.vitrine_fechada,
    mensagem_fechado: extras.mensagem_fechado,
    mensagem_boas_vindas: extras.mensagem_boas_vindas,
  };
  if ("texto_vitrine_aberto" in extras)
    payload.texto_vitrine_aberto = extras.texto_vitrine_aberto;
  if ("texto_vitrine_fechado" in extras)
    payload.texto_vitrine_fechado = extras.texto_vitrine_fechado;
  if ("mensagem_fora_horario" in extras)
    payload.mensagem_fora_horario = extras.mensagem_fora_horario;
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
): Promise<
  | { ok: true; skipped?: boolean }
  | { ok: false; message: string; code?: "rls" | "other" }
> {
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
  return runApiWithAccessLog(
    request,
    "/api/restaurante/config",
    "api.restaurante.config.fatal",
    async ({ requestId }) => {
      const authCookieWrites: CookieToSet[] = [];
      try {
      const cookieStore = await cookies();
      const sessionResponse = NextResponse.next({
        request: { headers: request.headers },
      });

      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookieOptions: getSupabaseServerCookieOptions(),
          ...getOwnerAuthStorageOptions(),
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
            setAll(cookiesToSet: CookieToSet[]) {
              cookiesToSet.forEach((raw) => {
                const { name, value, options } = latin1CookieWrite(raw);
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
          global: { fetch: serverLatin1SafeFetch },
        },
      );

      const authHeader = request.headers.get("Authorization");
      const bearerToken = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : null;

      let user = null as Awaited<
        ReturnType<typeof supabase.auth.getUser>
      >["data"]["user"];

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
        return jsonCfg(
          requestId,
          { error: "Sessão inválida ou expirada." },
          401,
          authCookieWrites,
        );
      }

      try {
        let body: ConfigBody;
        try {
          const raw = await request.json();
          if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
            return jsonCfg(
              requestId,
              { error: "O corpo deve ser um objeto JSON com os campos esperados." },
              400,
              authCookieWrites,
            );
          }
          body = raw as ConfigBody;
        } catch {
          return jsonCfg(
            requestId,
            { error: "Corpo da requisição inválido (JSON malformado ou vazio)." },
            400,
            authCookieWrites,
          );
        }

        const restauranteId =
          typeof body.restauranteId === "string"
            ? body.restauranteId.trim()
            : "";
        const nomeRaw = typeof body.nome === "string" ? body.nome.trim() : "";
        const nome = sanitizeDbPlainText(nomeRaw, 200);
        const whatsappRaw =
          typeof body.whatsapp === "string" ? body.whatsapp.trim() : "";
        const whatsapp = sanitizeDbPlainText(whatsappRaw, 64);
        const corRaw =
          typeof body.cor_tema === "string" ? body.cor_tema : "#0d9488";
        const horario =
          body.horario_funcionamento === null ||
          body.horario_funcionamento === undefined
            ? null
            : sanitizeDbPlainTextNullable(
                String(body.horario_funcionamento).trim(),
                4000,
              );
        const taxa =
          body.taxa_entrega === null ||
          body.taxa_entrega === undefined ||
          Number.isNaN(body.taxa_entrega)
            ? null
            : Math.max(0, Math.round(Number(body.taxa_entrega) * 100) / 100);
        const vitrineFechada = body.vitrine_fechada === true;
        const mensagemFechadoRaw =
          typeof body.mensagem_fechado === "string"
            ? body.mensagem_fechado.trim().slice(0, 400)
            : "";
        const mensagem_fechado =
          vitrineFechada && mensagemFechadoRaw.length > 0
            ? sanitizeDbPlainText(mensagemFechadoRaw, 400)
            : null;

        const normTxt = (v: unknown, max: number) =>
          sanitizeDbPlainTextNullable(typeof v === "string" ? v : null, max);
        const mensagem_boas_vindas = normTxt(body.mensagem_boas_vindas, 500);

        const legacyVitrineOpcional: {
          texto_vitrine_aberto?: string | null;
          texto_vitrine_fechado?: string | null;
          mensagem_fora_horario?: string | null;
        } = {};
        if ("texto_vitrine_aberto" in body) {
          legacyVitrineOpcional.texto_vitrine_aberto = normTxt(
            body.texto_vitrine_aberto,
            200,
          );
        }
        if ("texto_vitrine_fechado" in body) {
          legacyVitrineOpcional.texto_vitrine_fechado = normTxt(
            body.texto_vitrine_fechado,
            200,
          );
        }
        if ("mensagem_fora_horario" in body) {
          legacyVitrineOpcional.mensagem_fora_horario = normTxt(
            body.mensagem_fora_horario,
            400,
          );
        }

        const funcionamento_semana = body.funcionamento_semana;
        const taxasBody = body.taxas_entrega_zonas;
        const taxas_zonas = Array.isArray(taxasBody)
          ? (taxasBody as TaxaEntregaZona[]).map((z) => ({
              id: String(z.id ?? ""),
              nome: sanitizeDbPlainText(String(z.nome ?? "").trim(), 120),
              valor: Math.max(0, Math.round(Number(z.valor) * 100) / 100) || 0,
            }))
          : null;

        if (!restauranteId) {
          return jsonCfg(
            requestId,
            { error: "restauranteId é obrigatório." },
            400,
            authCookieWrites,
          );
        }
        if (nome.length < 2) {
          return jsonCfg(
            requestId,
            {
              error: "Informe o nome do estabelecimento (mínimo 2 caracteres).",
            },
            400,
            authCookieWrites,
          );
        }
        if (!whatsapp) {
          return jsonCfg(
            requestId,
            { error: "Informe o WhatsApp." },
            400,
            authCookieWrites,
          );
        }

        if (!funcionamento_semana || typeof funcionamento_semana !== "object") {
          return jsonCfg(
            requestId,
            { error: "Dados de funcionamento semanal inválidos." },
            400,
            authCookieWrites,
          );
        }
        const errF = validarFuncionamentoSemana(funcionamento_semana);
        if (errF) {
          return jsonCfg(requestId, { error: errF }, 400, authCookieWrites);
        }
        const funcionamentoSemanaGravar: FuncionamentoSemana =
          funcionamento_semana;
        const funcionamentoJsonGravar = serializarFuncionamentoSemanaParaJson(
          sanitizeDbJsonDeep(funcionamentoSemanaGravar),
        );
        const listaZonas = taxas_zonas ?? [];
        const errZ = validarTaxasZonas(listaZonas);
        if (errZ) {
          return jsonCfg(requestId, { error: errZ }, 400, authCookieWrites);
        }

        const cardapio_categorias = Array.isArray(body.cardapio_categorias)
          ? body.cardapio_categorias
              .map((x) => sanitizeDbPlainText(String(x ?? "").trim(), 48))
              .filter(Boolean)
          : parseCardapioCategorias(body.cardapio_categorias)
              .map((x) => sanitizeDbPlainText(x, 48))
              .filter(Boolean);
        const errC = validarCardapioCategorias(cardapio_categorias);
        if (errC) {
          return jsonCfg(requestId, { error: errC }, 400, authCookieWrites);
        }

        const entrega_modo = body.entrega_modo === "zonas" ? "zonas" : "fixa";
        if (entrega_modo === "zonas" && listaZonas.length === 0) {
          return jsonCfg(
            requestId,
            {
              error:
                "Em taxas por bairro, adicione ao menos uma região com nome e valor.",
            },
            400,
            authCookieWrites,
          );
        }

        const retirada_balcao = body.retirada_balcao === true;

        const cor_tema = normalizeCorTema(corRaw);

        let logoGravar: string | null | undefined = undefined;
        if (body.logo !== undefined) {
          if (body.logo === null) {
            logoGravar = null;
          } else if (typeof body.logo !== "string") {
            return jsonCfg(
              requestId,
              { error: "Campo logo inválido." },
              400,
              authCookieWrites,
            );
          } else {
            const t = body.logo.trim();
            if (!t) {
              logoGravar = null;
            } else if (t.length > 2500) {
              return jsonCfg(
                requestId,
                { error: "URL do logo muito longa." },
                400,
                authCookieWrites,
              );
            } else if (!/^https?:\/\//i.test(t)) {
              return jsonCfg(
                requestId,
                {
                  error: "A URL do logo deve começar com http:// ou https://.",
                },
                400,
                authCookieWrites,
              );
            } else {
              logoGravar = sanitizeDbPlainText(t, 2500);
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

        const lockVersion =
          typeof body.configVersion === "number" &&
          Number.isFinite(body.configVersion) &&
          body.configVersion >= 0
            ? Math.floor(body.configVersion)
            : null;

        const admin = createAdminSupabaseClient();

        async function runAll(
          client: SupabaseClient,
          ownerFilter: string | null,
          lockVersion: number | null,
        ) {
          const payload: Record<string, unknown> = { ...base };
          if (lockVersion != null) {
            payload.config_version = lockVersion + 1;
          }
          let q = client
            .from("restaurantes")
            .update(payload)
            .eq("id", restauranteId);
          if (ownerFilter) q = q.eq("owner_id", ownerFilter);
          if (lockVersion != null) {
            q = q.eq("config_version", lockVersion);
          }
          const baseRes = await q.select("id");
          if (!baseRes.error && (!baseRes.data?.length)) {
            if (lockVersion != null) {
              return {
                error:
                  "Configurações alteradas em outra aba ou sessão. Recarregue o painel e tente novamente.",
                code: "conflict" as const,
              };
            }
          }
          const r0 = interpretUpdate(baseRes);
          if (!r0.ok) return { error: r0.message, code: r0.code } as const;

          const r1 = await applyLegacyExtras(
            client,
            { id: restauranteId, ownerFilter },
            legacyExtras,
          );
          if (!r1.ok) return { error: r1.message, code: r1.code } as const;

          const r2 = await applyJsonExtras(
            client,
            { id: restauranteId, ownerFilter },
            {
              funcionamento_semana: funcionamentoJsonGravar,
              taxas_entrega_zonas: jsonZonas,
              cardapio_categorias,
              retirada_balcao,
              entrega_modo,
            },
          );
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
            if (isSchemaColumnError(selErr)) {
              logStructured("warn", "api.restaurante.config.select_owner_schema", {
                code: selErr.code ?? null,
                requestId,
              });
              return jsonCfg(
                requestId,
                {
                  error:
                    "A base de dados está desatualizada em relação ao código (colunas em falta). Execute as migrações SQL do projeto no Supabase e tente novamente.",
                  code: "schema_migration_required",
                  migrationHint: MIGRATION_HINT,
                },
                503,
                authCookieWrites,
              );
            }
            logStructured("error", "api.restaurante.config.select_owner", {
              code: selErr.code ?? null,
            });
            return jsonCfg(
              requestId,
              {
                error:
                  "Não foi possível validar o restaurante. Tente novamente.",
              },
              500,
              authCookieWrites,
            );
          }
          if (!row) {
            return jsonCfg(
              requestId,
              { error: "Restaurante não encontrado." },
              404,
              authCookieWrites,
            );
          }
          if (row.owner_id !== user.id) {
            return jsonCfg(
              requestId,
              {
                error: "Você não tem permissão para alterar este restaurante.",
              },
              403,
              authCookieWrites,
            );
          }

          const out = await runAll(admin, null, lockVersion);
          if ("error" in out) {
            const errStatus =
              out.code === "rls" ? 403 : out.code === "conflict" ? 409 : 500;
            return jsonCfg(
              requestId,
              { error: out.error, code: out.code },
              errStatus,
              authCookieWrites,
            );
          }
          return jsonCfg(
            requestId,
            {
              ok: true,
              ...(lockVersion != null ? { configVersion: lockVersion + 1 } : {}),
              ...(out.partial ? { warning: MIGRATION_HINT } : {}),
            },
            200,
            authCookieWrites,
          );
        }

        const out = await runAll(supabase, user.id, lockVersion);
        if ("error" in out) {
          const hint =
            out.code === "rls"
              ? " Ative a política RLS de UPDATE para donos em `restaurantes` ou configure SUPABASE_SERVICE_ROLE_KEY no servidor (ex.: Vercel)."
              : "";
          const errStatus =
            out.code === "rls" ? 403 : out.code === "conflict" ? 409 : 500;
          return jsonCfg(
            requestId,
            { error: `${out.error}${hint}`, code: out.code },
            errStatus,
            authCookieWrites,
          );
        }

        return jsonCfg(
          requestId,
          {
            ok: true,
            ...(lockVersion != null ? { configVersion: lockVersion + 1 } : {}),
            ...(out.partial ? { warning: MIGRATION_HINT } : {}),
          },
          200,
          authCookieWrites,
        );
      } catch (unexpected: unknown) {
        logStructured("error", "api.restaurante.config.unexpected", {
          errName: unexpected instanceof Error ? unexpected.name : "unknown",
          errSummary:
            unexpected instanceof Error
              ? unexpected.message.slice(0, 400)
              : String(unexpected).slice(0, 400),
          requestId,
        });
        return jsonCfg(
          requestId,
          { error: "Erro interno ao salvar as configurações." },
          500,
          authCookieWrites,
        );
      }
      } catch (fatal: unknown) {
        logStructured("error", "api.restaurante.config.fatal_outer", {
          errName: fatal instanceof Error ? fatal.name : typeof fatal,
          errSummary:
            fatal instanceof Error
              ? fatal.message.slice(0, 400)
              : String(fatal).slice(0, 400),
          requestId,
        });
        return jsonCfg(
          requestId,
          {
            error:
              "Erro interno ao processar o pedido de configuração. Tente novamente em instantes.",
          },
          500,
          authCookieWrites,
        );
      }
    },
  );
}
