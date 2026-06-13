import { NextResponse } from "next/server";
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
  "NAO enviar para entrega: cliente retira no estabelecimento.\n" +
  "Acompanhe na esteira ate disponibilizar para retirada no balcao.\n\n";

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
  try {
    const admin = createAdminSupabaseClient();
    if (!admin) {
      logStructured("error", "api.pedidos.vitrine.no_service_role", {});
      return NextResponse.json(
        {
          error:
            "Servidor não configurado para registrar pedidos. Defina SUPABASE_SERVICE_ROLE_KEY no ambiente (ex.: Vercel).",
        },
        { status: 503 },
      );
    }

    let body: BodyVitrinePedido;
    let rawBody: Record<string, unknown>;
    try {
      rawBody = (await request.json()) as Record<string, unknown>;
      body = rawBody as BodyVitrinePedido;
    } catch {
      logStructured("warn", "api.pedidos.vitrine.invalid_json", {});
      return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
    }

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
      });
      return NextResponse.json(
        { error: "Dados do cliente inválidos." },
        { status: 400 },
      );
    }
    if (!isUuid(restauranteId)) {
      logStructured("warn", "api.pedidos.vitrine.validation_restaurante_id", {
        restauranteId,
      });
      return NextResponse.json(
        { error: "Identificador do estabelecimento inválido." },
        { status: 400 },
      );
    }
    if (!telefone || telefone.length < 8) {
      logStructured("warn", "api.pedidos.vitrine.validation_telefone", {
        restauranteId,
      });
      return NextResponse.json(
        { error: "Telefone inválido." },
        { status: 400 },
      );
    }
    if (
      forma !== "dinheiro" &&
      forma !== "pix" &&
      forma !== "cartao_debito" &&
      forma !== "cartao_credito"
    ) {
      logStructured("warn", "api.pedidos.vitrine.validation_pagamento", {
        restauranteId,
      });
      return NextResponse.json(
        { error: "Forma de pagamento inválida." },
        { status: 400 },
      );
    }

    const linhas = parseLinhasPedidoVitrine(body);
    if (!linhas) {
      logStructured("warn", "api.pedidos.vitrine.validation_linhas", {
        restauranteId,
        reason: "linhas_invalidas_ou_ausentes",
      });
      return NextResponse.json(
        {
          error:
            "Lista de itens inválida. Envie `linhas: [{ pratoId, quantidade }]` e atualize a página se necessário.",
        },
        { status: 400 },
      );
    }

    const obsRaw = typeof body.observacoes === "string" ? body.observacoes : "";
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
        },
      );
      return NextResponse.json(
        { error: restLoaded.error },
        { status: restLoaded.status },
      );
    }
    const row = restLoaded.row;

    if (row.vitrine_fechada === true) {
      return NextResponse.json(
        { error: "Restaurante fechado para novos pedidos." },
        { status: 409 },
      );
    }

    if (tipoEntrega === "retirada" && row.retirada_balcao !== true) {
      return NextResponse.json(
        { error: "Este restaurante não oferece retirada no balcão." },
        { status: 400 },
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
      return NextResponse.json(
        { error: "Fora do horário de atendimento." },
        { status: 409 },
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
        });
        return NextResponse.json(
          { error: "O servidor demorou a validar os itens. Tente novamente." },
          { status: 504 },
        );
      }
      logStructured("error", "api.pedidos.vitrine.pratos_select", {
        restauranteId,
        message: prErr.message,
        code: prErr.code,
      });
      return NextResponse.json(
        { error: "Não foi possível validar os itens do pedido." },
        { status: 500 },
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
      });
      return NextResponse.json({ error: tot.error }, { status: 400 });
    }

    const pagamento = mapPagamentoPedidoDb(forma);

    const { data: inserted, error: insErr } = await admin
      .from("pedidos")
      .insert({
        restaurante_id: restauranteId,
        cliente,
        telefone,
        total: tot.total,
        pagamento,
        coluna: "recebidos",
        observacoes: observacoesBase,
        itens: tot.linhasItensTexto,
        motoboy: "",
      })
      .select("id")
      .abortSignal(dbSignal())
      .maybeSingle();

    if (insErr) {
      if (isSupabaseQueryTimeoutLike(insErr)) {
        logStructured("error", "api.pedidos.vitrine.insert_timeout", {
          restauranteId,
        });
        return NextResponse.json(
          {
            error: "O servidor demorou a registrar o pedido. Tente novamente.",
          },
          { status: 504 },
        );
      }
      logStructured("error", "api.pedidos.vitrine.insert", {
        restauranteId,
        code: insErr.code,
        message: insErr.message,
      });
      return NextResponse.json(
        {
          error:
            "Não foi possível registrar o pedido. Tente novamente em instantes.",
        },
        { status: 500 },
      );
    }

    logStructured("info", "api.pedidos.vitrine.ok", {
      restauranteId,
      pedidoId: inserted?.id ?? null,
      subtotalCalculado: tot.subtotal,
      taxaEntregaCalculada: tot.taxa,
      totalCalculado: tot.total,
      linhas: linhas.length,
    });

    return NextResponse.json(
      { ok: true, id: inserted?.id ?? null },
      { headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  } catch (unexpected: unknown) {
    logStructured("error", "api.pedidos.vitrine.unexpected", {
      message:
        unexpected instanceof Error ? unexpected.message : String(unexpected),
    });
    return NextResponse.json(
      { error: "Erro interno ao processar o pedido." },
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }
}
