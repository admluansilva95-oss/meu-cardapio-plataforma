import { assertPodeRegistrarPedidoVitrine } from "@/lib/billing/restaurante-plan";
import { checkRateLimit, clientIpFromRequest } from "@/lib/http/rate-limit";
import { logStructured } from "@/lib/logging/structured-log";
import { parseFuncionamentoSemana } from "@/lib/restaurante/funcionamento-semana";
import { statusAberturaPorRelogio } from "@/lib/restaurante/horario-vitrine";
import {
  computeTotaisPedidoVitrine,
  isUuid,
  OBSERVACOES_VITRINE_MAX_TOTAL_CHARS,
  OBSERVACOES_VITRINE_MAX_USER_CHARS,
  parseLinhasPedidoVitrine,
  sanitizeObservacoesVitrine,
  type PratoPrecoRow,
} from "@/lib/restaurante/pedido-vitrine-calculo";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Restaurante } from "@/types";
import { sanitizeDbPlainText } from "@/lib/db/sanitize-persist";
import { jsonWithRequestId } from "@/lib/http/json-with-request-id";
import { runApiWithAccessLog } from "@/lib/http/run-api-with-access-log";
import {
  SUPABASE_SERVER_WRITE_TIMEOUT_MS,
  isSupabaseQueryTimeoutLike,
  supabaseQuerySignal,
} from "@/lib/supabase/query-timeouts";

/**
 * Pedidos da vitrine → `public.pedidos`.
 * Preços e total são **sempre** recalculados no servidor a partir dos IDs dos pratos.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_IDEMPOTENCY_KEY = /^[a-zA-Z0-9._-]{8,128}$/;

function resolveIdempotencyKey(
  request: Request,
  rawBody: Record<string, unknown>,
): string | null {
  const header = request.headers.get("Idempotency-Key")?.trim() ?? "";
  const bodyRaw = rawBody.idempotencyKey;
  const fromBody = typeof bodyRaw === "string" ? bodyRaw.trim() : "";
  const chosen = header || fromBody;
  if (!chosen || !SAFE_IDEMPOTENCY_KEY.test(chosen)) return null;
  return chosen;
}

function dbSignal(): AbortSignal {
  return supabaseQuerySignal(SUPABASE_SERVER_WRITE_TIMEOUT_MS);
}

type FormaCheckout = "dinheiro" | "pix" | "cartao_debito" | "cartao_credito";

function mapPagamentoPedidoDb(f: FormaCheckout): "Pix" | "Cartão" | "Dinheiro" {
  if (f === "pix") return "Pix";
  if (f === "dinheiro") return "Dinheiro";
  return "Cartão";
}

/**
 * Payload aceito: identificação, cliente, entrega e `linhas`.
 * Qualquer `total` / `subtotal` / `preco` / `itens` (legado) no JSON é **ignorado** e pode gerar log WARN.
 */
type BodyVitrinePedido = {
  restauranteId?: string;
  cliente?: string;
  telefone?: string;
  formaPagamento?: FormaCheckout;
  linhas?: unknown;
  zonaEntregaId?: string | null;
  observacoes?: string;
  tipoEntrega?: string;
};

const CAMPOS_PRECO_IGNORADOS = [
  "total",
  "subtotal",
  "preco",
  "precos",
  "valorTotal",
  "taxaEntrega",
  "taxa_entrega_cliente",
  "desconto",
  "itens",
] as const;

function warnCamposPrecoIgnorados(
  body: Record<string, unknown>,
  restauranteId: string | undefined,
): void {
  for (const k of CAMPOS_PRECO_IGNORADOS) {
    if (body[k] !== undefined) {
      logStructured("warn", "api.pedidos.vitrine.ignored_client_field", {
        restauranteId: restauranteId ?? null,
        field: k,
      });
    }
  }
}

const PREFIXO_OBS_BALCAO =
  "=== RETIRADA NO BALCAO ===\n" +
  "Interno (painel): nao despachar entrega — cliente retira no estabelecimento.\n\n";

function isSchemaOrUnknownColumnError(
  err: {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  } | null,
): boolean {
  if (!err) return false;
  const blob = [err.message, err.details, err.hint, err.code]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (blob.includes("42703")) return true;
  if (blob.includes("schema cache")) return true;
  if (blob.includes("does not exist")) return true;
  if (blob.includes("could not find") && blob.includes("column")) return true;
  if (blob.includes("pgrst204")) return true;
  return false;
}

/** Erros de rede / chave / JWT — mensagem mais útil que o genérico 500. */
function mapSupabaseInfrastructureFailure(
  err: {
    message?: string;
    code?: string;
  } | null,
): { status: number; error: string } | null {
  if (!err) return null;
  const m = (err.message ?? "").toLowerCase();
  const c = (err.code ?? "").toLowerCase();
  if (
    m.includes("invalid api key") ||
    m.includes("jwt expired") ||
    (m.includes("jwt") && m.includes("invalid")) ||
    c === "pgrst301" ||
    m.includes("no suitable key")
  ) {
    return {
      status: 503,
      error:
        "Servidor não autenticou na base de dados. Confira SUPABASE_SERVICE_ROLE_KEY e NEXT_PUBLIC_SUPABASE_URL no ambiente (ex.: Vercel).",
    };
  }
  if (
    m.includes("fetch failed") ||
    m.includes("econnrefused") ||
    m.includes("enotfound") ||
    m.includes("etimedout")
  ) {
    return {
      status: 503,
      error:
        "Não foi possível contactar a base de dados. Tente novamente em instantes.",
    };
  }
  if (m.includes("relation") && m.includes("does not exist")) {
    return {
      status: 503,
      error:
        "Base de dados desatualizada ou inacessível. Verifique migrações e o projeto Supabase.",
    };
  }
  return null;
}

type RestRow = {
  id: string;
  vitrine_fechada?: boolean | null;
  funcionamento_semana?: unknown;
  retirada_balcao?: boolean | null;
  taxa_entrega?: number | string | null;
  taxas_entrega_zonas?: unknown;
  entrega_modo?: string | null;
};

async function carregarRestaurantePedido(
  admin: NonNullable<ReturnType<typeof createAdminSupabaseClient>>,
  restauranteId: string,
): Promise<
  { ok: true; row: RestRow } | { ok: false; status: number; error: string }
> {
  const selFull = await admin
    .from("restaurantes")
    .select(
      "id, vitrine_fechada, funcionamento_semana, retirada_balcao, taxa_entrega, taxas_entrega_zonas, entrega_modo",
    )
    .eq("id", restauranteId)
    .abortSignal(dbSignal())
    .maybeSingle();

  if (!selFull.error && selFull.data) {
    return { ok: true, row: selFull.data as RestRow };
  }

  if (selFull.error && !isSchemaOrUnknownColumnError(selFull.error)) {
    const msg = (selFull.error.message ?? "").toLowerCase();
    if (
      msg.includes("invalid input syntax for type uuid") ||
      msg.includes("22p02")
    ) {
      return {
        ok: false,
        status: 400,
        error: "Identificador do estabelecimento inválido.",
      };
    }
    const infra = mapSupabaseInfrastructureFailure(selFull.error);
    if (infra) {
      logStructured("error", "api.pedidos.vitrine.restaurante_select_infra", {
        restauranteId,
        message: selFull.error.message,
        code: selFull.error.code,
      });
      return { ok: false, status: infra.status, error: infra.error };
    }
    logStructured("error", "api.pedidos.vitrine.restaurante_select", {
      restauranteId,
      message: selFull.error.message,
      code: selFull.error.code,
      details: selFull.error.details ?? null,
      hint: selFull.error.hint ?? null,
    });
    return {
      ok: false,
      status: 500,
      error: "Erro interno ao consultar o estabelecimento.",
    };
  }

  const selMin = await admin
    .from("restaurantes")
    .select("id, vitrine_fechada, funcionamento_semana, retirada_balcao")
    .eq("id", restauranteId)
    .abortSignal(dbSignal())
    .maybeSingle();

  if (selMin.error) {
    if (isSchemaOrUnknownColumnError(selMin.error)) {
      const soId = await admin
        .from("restaurantes")
        .select("id")
        .eq("id", restauranteId)
        .abortSignal(dbSignal())
        .maybeSingle();
      if (soId.error || !soId.data) {
        const infra = mapSupabaseInfrastructureFailure(soId.error);
        if (infra)
          return { ok: false, status: infra.status, error: infra.error };
        logStructured(
          "error",
          "api.pedidos.vitrine.restaurante_select_fallback_id",
          {
            restauranteId,
            message: soId.error?.message,
            code: soId.error?.code,
          },
        );
        return {
          ok: false,
          status: 500,
          error: "Erro interno ao consultar o estabelecimento.",
        };
      }
      return {
        ok: true,
        row: {
          id: soId.data.id,
          vitrine_fechada: false,
          funcionamento_semana: undefined,
          retirada_balcao: false,
          taxa_entrega: null,
          taxas_entrega_zonas: null,
          entrega_modo: "fixa",
        },
      };
    }
    const infra = mapSupabaseInfrastructureFailure(selMin.error);
    if (infra) {
      logStructured(
        "error",
        "api.pedidos.vitrine.restaurante_select_min_infra",
        {
          restauranteId,
          message: selMin.error.message,
          code: selMin.error.code,
        },
      );
      return { ok: false, status: infra.status, error: infra.error };
    }
    logStructured("error", "api.pedidos.vitrine.restaurante_select_min", {
      restauranteId,
      message: selMin.error.message,
      code: selMin.error.code,
      details: selMin.error.details ?? null,
    });
    return {
      ok: false,
      status: 500,
      error: "Erro interno ao consultar o estabelecimento.",
    };
  }

  if (!selMin.data) {
    return { ok: false, status: 404, error: "Restaurante não encontrado." };
  }

  const tax = await admin
    .from("restaurantes")
    .select("taxa_entrega, taxas_entrega_zonas, entrega_modo")
    .eq("id", restauranteId)
    .abortSignal(dbSignal())
    .maybeSingle();

  const trow =
    !tax.error && tax.data
      ? (tax.data as Pick<
          RestRow,
          "taxa_entrega" | "taxas_entrega_zonas" | "entrega_modo"
        >)
      : {};

  return {
    ok: true,
    row: {
      ...(selMin.data as RestRow),
      taxa_entrega: trow.taxa_entrega ?? null,
      taxas_entrega_zonas: trow.taxas_entrega_zonas ?? null,
      entrega_modo: trow.entrega_modo ?? "fixa",
    },
  };
}

function taxaFixaNum(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export async function POST(request: Request) {
  return runApiWithAccessLog(
    request,
    "/api/pedidos/vitrine",
    "api.pedidos.vitrine.fatal",
    async ({ request, requestId }) => {
      try {
      const rate = checkRateLimit(
        `pedidos-vitrine:${clientIpFromRequest(request)}`,
        30,
        60_000,
      );
      if (!rate.ok) {
        return jsonWithRequestId(
          requestId,
          { error: "Muitas requisições. Aguarde um momento." },
          429,
          { "Retry-After": String(rate.retryAfterSec) },
        );
      }

      const admin = createAdminSupabaseClient();
      if (!admin) {
        logStructured("error", "api.pedidos.vitrine.no_service_role", { requestId });
        return jsonWithRequestId(
          requestId,
          {
            error:
              "Servidor não configurado para registrar pedidos. Defina SUPABASE_SERVICE_ROLE_KEY no ambiente (ex.: Vercel).",
          },
          503,
        );
      }

      let body: BodyVitrinePedido;
      let rawBody: Record<string, unknown>;
      try {
        const raw = await request.json();
        if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
          logStructured("warn", "api.pedidos.vitrine.invalid_body_shape", { requestId });
          return jsonWithRequestId(
            requestId,
            {
              error:
                "O corpo deve ser um objeto JSON com os campos do pedido (ex.: restauranteId, cliente, linhas).",
            },
            400,
          );
        }
        rawBody = raw as Record<string, unknown>;
        body = rawBody as BodyVitrinePedido;
      } catch {
        logStructured("warn", "api.pedidos.vitrine.invalid_json", { requestId });
        return jsonWithRequestId(
          requestId,
          { error: "JSON inválido ou corpo vazio." },
          400,
        );
      }

      const idempotencyKey = resolveIdempotencyKey(request, rawBody);
      const restauranteIdRaw = body.restauranteId;
      const restauranteId =
        typeof restauranteIdRaw === "string"
          ? restauranteIdRaw.trim()
          : typeof restauranteIdRaw === "number" &&
              Number.isFinite(restauranteIdRaw)
            ? String(Math.trunc(restauranteIdRaw))
            : "";
      warnCamposPrecoIgnorados(rawBody, restauranteId);
      const clienteRaw =
        typeof body.cliente === "string" ? body.cliente.trim() : "";
      const telefoneRaw =
        typeof body.telefone === "string" ? body.telefone.trim() : "";
      const cliente = sanitizeDbPlainText(clienteRaw, 200);
      const telefone = sanitizeDbPlainText(telefoneRaw, 40);
      const forma = body.formaPagamento;

      if (!restauranteId || !cliente || cliente.length < 2) {
        logStructured("warn", "api.pedidos.vitrine.validation_cliente", {
          restauranteId,
          requestId,
        });
        return jsonWithRequestId(requestId, { error: "Dados do cliente inválidos." }, 400);
      }
      if (!isUuid(restauranteId)) {
        logStructured("warn", "api.pedidos.vitrine.validation_restaurante_id", {
          restauranteId,
          requestId,
        });
        return jsonWithRequestId(
          requestId,
          { error: "Identificador do estabelecimento inválido." },
          400,
        );
      }
      if (!telefone || telefone.length < 8) {
        logStructured("warn", "api.pedidos.vitrine.validation_telefone", {
          restauranteId,
          requestId,
        });
        return jsonWithRequestId(requestId, { error: "Telefone inválido." }, 400);
      }
      if (
        forma !== "dinheiro" &&
        forma !== "pix" &&
        forma !== "cartao_debito" &&
        forma !== "cartao_credito"
      ) {
        logStructured("warn", "api.pedidos.vitrine.validation_pagamento", {
          restauranteId,
          requestId,
        });
        return jsonWithRequestId(requestId, { error: "Forma de pagamento inválida." }, 400);
      }

      const linhas = parseLinhasPedidoVitrine(body);
      if (!linhas) {
        logStructured("warn", "api.pedidos.vitrine.validation_linhas", {
          restauranteId,
          reason: "linhas_invalidas_ou_ausentes",
          requestId,
        });
        return jsonWithRequestId(
          requestId,
          {
            error:
              "Lista de itens inválida. Envie `linhas: [{ pratoId, quantidade }]` e atualize a página se necessário.",
          },
          400,
        );
      }

      const obsRaw =
        typeof body.observacoes === "string" ? body.observacoes : "";
      const obsSan = sanitizeObservacoesVitrine(
        obsRaw,
        OBSERVACOES_VITRINE_MAX_USER_CHARS,
      );

      const tipoEntrega =
        body.tipoEntrega === "retirada" || body.tipoEntrega === "entrega"
          ? body.tipoEntrega
          : "entrega";

      const zonaRaw = body.zonaEntregaId;
      const zonaEntregaId =
        zonaRaw === null || zonaRaw === undefined
          ? null
          : typeof zonaRaw === "string" && isUuid(zonaRaw.trim())
            ? zonaRaw.trim()
            : null;

      const restLoaded = await carregarRestaurantePedido(admin, restauranteId);
      if (!restLoaded.ok) {
        logStructured(
          restLoaded.status >= 500 ? "error" : "warn",
          "api.pedidos.vitrine.restaurante_load_failed",
          {
            restauranteId,
            status: restLoaded.status,
            requestId,
          },
        );
        return jsonWithRequestId(
          requestId,
          { error: restLoaded.error },
          restLoaded.status,
        );
      }
      const row = restLoaded.row;

      const planGate = await assertPodeRegistrarPedidoVitrine(restauranteId);
      if (!planGate.ok) {
        logStructured("warn", "api.pedidos.vitrine.plan_limit", {
          restauranteId,
          requestId,
        });
        return jsonWithRequestId(
          requestId,
          { error: "Limite de pedidos do plano atingido", code: "limite_atingido" },
          429,
        );
      }

      if (row.vitrine_fechada === true) {
        return jsonWithRequestId(
          requestId,
          { error: "Restaurante fechado para novos pedidos." },
          409,
        );
      }

      if (tipoEntrega === "retirada" && row.retirada_balcao !== true) {
        return jsonWithRequestId(
          requestId,
          { error: "Este restaurante não oferece retirada no balcão." },
          400,
        );
      }

      const observacoesBase = sanitizeDbPlainText(
        sanitizeObservacoesVitrine(
          (tipoEntrega === "retirada" ? PREFIXO_OBS_BALCAO : "") + obsSan,
          OBSERVACOES_VITRINE_MAX_TOTAL_CHARS,
        ),
        OBSERVACOES_VITRINE_MAX_TOTAL_CHARS,
      );

      const funcionamento_semana =
        parseFuncionamentoSemana(row.funcionamento_semana) ?? undefined;
      const horarioStub = { funcionamento_semana } as Restaurante;
      if (statusAberturaPorRelogio(horarioStub) === "fechado") {
        return jsonWithRequestId(
          requestId,
          { error: "Fora do horário de atendimento." },
          409,
        );
      }

      const pratoIds = [...new Set(linhas.map((l) => l.pratoId))];
      const { data: pratosRows, error: prErr } = await admin
        .from("pratos")
        .select("id, nome, preco, status, categoria")
        .eq("restaurante_id", restauranteId)
        .eq("status", "ativo")
        .in("id", pratoIds)
        .abortSignal(dbSignal());

      if (prErr) {
        if (isSupabaseQueryTimeoutLike(prErr)) {
          logStructured("error", "api.pedidos.vitrine.pratos_select_timeout", {
            restauranteId,
            requestId,
          });
          return jsonWithRequestId(
            requestId,
            {
              error: "O servidor demorou a validar os itens. Tente novamente.",
            },
            504,
          );
        }
        logStructured("error", "api.pedidos.vitrine.pratos_select", {
          restauranteId,
          message: prErr.message,
          code: prErr.code,
          requestId,
        });
        return jsonWithRequestId(
          requestId,
          { error: "Não foi possível validar os itens do pedido." },
          500,
        );
      }

      const pratosPorId = new Map<string, PratoPrecoRow>();
      for (const r of pratosRows ?? []) {
        const p = r as Record<string, unknown>;
        const id = typeof p.id === "string" ? p.id : "";
        if (!id) continue;
        pratosPorId.set(id, {
          id,
          nome: typeof p.nome === "string" ? p.nome : "",
          preco: typeof p.preco === "number" ? p.preco : Number(p.preco),
          status: typeof p.status === "string" ? p.status : "",
          categoria: typeof p.categoria === "string" ? p.categoria : null,
        });
      }

      const tot = computeTotaisPedidoVitrine({
        linhas,
        pratosPorId,
        tipoEntrega,
        taxaFixa: taxaFixaNum(row.taxa_entrega),
        zonasRaw: row.taxas_entrega_zonas,
        zonaEntregaId,
      });

      if (!tot.ok) {
        logStructured("warn", "api.pedidos.vitrine.calculo_falhou", {
          restauranteId,
          error: tot.error,
          linhas: linhas.length,
          requestId,
        });
        return jsonWithRequestId(requestId, { error: tot.error }, 400);
      }

      const pagamento = mapPagamentoPedidoDb(forma);

      if (idempotencyKey) {
        const { data: existente } = await admin
          .from("pedidos")
          .select("id")
          .eq("restaurante_id", restauranteId)
          .eq("idempotency_key", idempotencyKey)
          .abortSignal(dbSignal())
          .maybeSingle();
        if (existente?.id) {
          logStructured("info", "api.pedidos.vitrine.idempotent_hit", {
            restauranteId,
            pedidoId: existente.id,
            requestId,
          });
          return jsonWithRequestId(
            requestId,
            { ok: true, id: existente.id, duplicate: true },
            200,
          );
        }
      }

      const insertRow: Record<string, unknown> = {
        restaurante_id: restauranteId,
        cliente,
        telefone,
        total: tot.total,
        pagamento,
        coluna: "recebidos",
        observacoes: observacoesBase,
        itens: tot.linhasItensTexto,
        motoboy: "",
      };
      if (idempotencyKey) {
        insertRow.idempotency_key = idempotencyKey;
      }

      const { data: inserted, error: insErr } = await admin
        .from("pedidos")
        .insert(insertRow as never)
        .select("id")
        .abortSignal(dbSignal())
        .maybeSingle();

      if (insErr) {
        if (insErr.code === "23505" && idempotencyKey) {
          const { data: race } = await admin
            .from("pedidos")
            .select("id")
            .eq("restaurante_id", restauranteId)
            .eq("idempotency_key", idempotencyKey)
            .abortSignal(dbSignal())
            .maybeSingle();
          if (race?.id) {
            return jsonWithRequestId(
              requestId,
              { ok: true, id: race.id, duplicate: true },
              200,
            );
          }
        }
        if (isSupabaseQueryTimeoutLike(insErr)) {
          logStructured("error", "api.pedidos.vitrine.insert_timeout", {
            restauranteId,
            requestId,
          });
          return jsonWithRequestId(
            requestId,
            {
              error:
                "O servidor demorou a registrar o pedido. Tente novamente.",
            },
            504,
          );
        }
        if (isSchemaOrUnknownColumnError(insErr)) {
          logStructured("error", "api.pedidos.vitrine.insert_schema", {
            restauranteId,
            code: insErr.code ?? null,
            requestId,
          });
          return jsonWithRequestId(
            requestId,
            {
              error:
                "O servidor precisa de uma migração na base de dados (tabela de pedidos desatualizada). Execute as migrações do repositório no Supabase e tente novamente.",
              code: "schema_migration_required",
            },
            503,
          );
        }
        logStructured("error", "api.pedidos.vitrine.insert", {
          restauranteId,
          code: insErr.code,
          message: insErr.message,
          requestId,
        });
        return jsonWithRequestId(
          requestId,
          {
            error:
              "Não foi possível registrar o pedido. Tente novamente em instantes.",
          },
          500,
        );
      }

      logStructured("info", "api.pedidos.vitrine.ok", {
        restauranteId,
        pedidoId: inserted?.id ?? null,
        subtotalCalculado: tot.subtotal,
        taxaEntregaCalculada: tot.taxa,
        totalCalculado: tot.total,
        linhas: linhas.length,
        requestId,
      });

      return jsonWithRequestId(
        requestId,
        { ok: true, id: inserted?.id ?? null },
        200,
      );
    } catch (unexpected: unknown) {
      const errName =
        unexpected instanceof Error ? unexpected.name : typeof unexpected;
      const errSummary =
        unexpected instanceof Error
          ? unexpected.message.slice(0, 500)
          : String(unexpected).slice(0, 500);
      logStructured("error", "api.pedidos.vitrine.unexpected_handler", {
        requestId,
        errName,
        errSummary,
      });
      return jsonWithRequestId(
        requestId,
        {
          error:
            "Erro interno ao processar o pedido. Tente novamente em instantes.",
        },
        500,
      );
    }
    },
  );
}
