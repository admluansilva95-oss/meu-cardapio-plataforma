import { NextResponse } from "next/server";
import { logStructured } from "@/lib/logging/structured-log";
import { parseFuncionamentoSemana } from "@/lib/restaurante/funcionamento-semana";
import { statusAberturaPorRelogio } from "@/lib/restaurante/horario-vitrine";
import {
  computeTotaisPedidoVitrine,
  isUuid,
  parseLinhasPedidoVitrine,
  sanitizeObservacoesVitrine,
  type PratoPrecoRow,
} from "@/lib/restaurante/pedido-vitrine-calculo";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Restaurante } from "@/types";

/**
 * Pedidos da vitrine → `public.pedidos`.
 * Preços e total são **sempre** recalculados no servidor a partir dos IDs dos pratos.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FormaCheckout = "dinheiro" | "pix" | "cartao_debito" | "cartao_credito";

function mapPagamentoPedidoDb(f: FormaCheckout): "Pix" | "Cartão" | "Dinheiro" {
  if (f === "pix") return "Pix";
  if (f === "dinheiro") return "Dinheiro";
  return "Cartão";
}

type Body = {
  restauranteId?: string;
  cliente?: string;
  telefone?: string;
  /** Ignorado: total vem do cálculo server-side. */
  total?: number;
  formaPagamento?: FormaCheckout;
  /** @deprecated painel antigo — use `linhas`. */
  itens?: unknown;
  /** Itens com quantidade; preço vem do banco. */
  linhas?: unknown;
  zonaEntregaId?: string | null;
  observacoes?: string;
  tipoEntrega?: string;
};

const PREFIXO_OBS_BALCAO =
  "=== RETIRADA NO BALCAO ===\n" +
  "NAO enviar para entrega: cliente retira no estabelecimento.\n" +
  "Acompanhe na esteira ate disponibilizar para retirada no balcao.\n\n";

function isSchemaOrUnknownColumnError(err: {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
} | null): boolean {
  if (!err) return false;
  const blob = [err.message, err.details, err.hint, err.code].filter(Boolean).join(" ").toLowerCase();
  if (blob.includes("42703")) return true;
  if (blob.includes("schema cache")) return true;
  if (blob.includes("does not exist")) return true;
  if (blob.includes("could not find") && blob.includes("column")) return true;
  if (blob.includes("pgrst204")) return true;
  return false;
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
): Promise<{ ok: true; row: RestRow } | { ok: false; status: number; error: string }> {
  const selFull = await admin
    .from("restaurantes")
    .select(
      "id, vitrine_fechada, funcionamento_semana, retirada_balcao, taxa_entrega, taxas_entrega_zonas, entrega_modo",
    )
    .eq("id", restauranteId)
    .maybeSingle();

  if (!selFull.error && selFull.data) {
    return { ok: true, row: selFull.data as RestRow };
  }

  if (selFull.error && !isSchemaOrUnknownColumnError(selFull.error)) {
    const msg = (selFull.error.message ?? "").toLowerCase();
    if (msg.includes("invalid input syntax for type uuid") || msg.includes("22p02")) {
      return { ok: false, status: 400, error: "Identificador do estabelecimento inválido." };
    }
    logStructured("error", "api.pedidos.vitrine.restaurante_select", {
      restauranteId,
      message: selFull.error.message,
      code: selFull.error.code,
    });
    return { ok: false, status: 500, error: "Erro interno ao consultar o estabelecimento." };
  }

  const selMin = await admin
    .from("restaurantes")
    .select("id, vitrine_fechada, funcionamento_semana, retirada_balcao")
    .eq("id", restauranteId)
    .maybeSingle();

  if (selMin.error) {
    if (isSchemaOrUnknownColumnError(selMin.error)) {
      const soId = await admin.from("restaurantes").select("id").eq("id", restauranteId).maybeSingle();
      if (soId.error || !soId.data) {
        return { ok: false, status: 500, error: "Erro interno ao consultar o estabelecimento." };
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
    return { ok: false, status: 500, error: "Erro interno ao consultar o estabelecimento." };
  }

  if (!selMin.data) {
    return { ok: false, status: 404, error: "Restaurante não encontrado." };
  }

  const tax = await admin
    .from("restaurantes")
    .select("taxa_entrega, taxas_entrega_zonas, entrega_modo")
    .eq("id", restauranteId)
    .maybeSingle();

  const trow = !tax.error && tax.data ? (tax.data as Pick<RestRow, "taxa_entrega" | "taxas_entrega_zonas" | "entrega_modo">) : {};

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

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const restauranteId = typeof body.restauranteId === "string" ? body.restauranteId.trim() : "";
  const cliente = typeof body.cliente === "string" ? body.cliente.trim() : "";
  const telefone = typeof body.telefone === "string" ? body.telefone.trim() : "";
  const forma = body.formaPagamento;

  if (!restauranteId || !cliente || cliente.length < 2) {
    return NextResponse.json({ error: "Dados do cliente inválidos." }, { status: 400 });
  }
  if (!isUuid(restauranteId)) {
    return NextResponse.json({ error: "Identificador do estabelecimento inválido." }, { status: 400 });
  }
  if (!telefone || telefone.length < 8) {
    return NextResponse.json({ error: "Telefone inválido." }, { status: 400 });
  }
  if (
    forma !== "dinheiro" &&
    forma !== "pix" &&
    forma !== "cartao_debito" &&
    forma !== "cartao_credito"
  ) {
    return NextResponse.json({ error: "Forma de pagamento inválida." }, { status: 400 });
  }

  const linhas = parseLinhasPedidoVitrine(body);
  if (!linhas) {
    return NextResponse.json(
      {
        error:
          "Lista de itens inválida. Atualize a página e tente novamente (formato antigo não suportado).",
      },
      { status: 400 },
    );
  }

  const obsRaw = typeof body.observacoes === "string" ? body.observacoes : "";
  const obsSan = sanitizeObservacoesVitrine(obsRaw, 12_000);

  const tipoEntrega =
    body.tipoEntrega === "retirada" || body.tipoEntrega === "entrega" ? body.tipoEntrega : "entrega";

  const zonaRaw = body.zonaEntregaId;
  const zonaEntregaId =
    zonaRaw === null || zonaRaw === undefined
      ? null
      : typeof zonaRaw === "string" && isUuid(zonaRaw.trim())
        ? zonaRaw.trim()
        : null;

  const restLoaded = await carregarRestaurantePedido(admin, restauranteId);
  if (!restLoaded.ok) {
    return NextResponse.json({ error: restLoaded.error }, { status: restLoaded.status });
  }
  const row = restLoaded.row;

  if (row.vitrine_fechada === true) {
    return NextResponse.json({ error: "Restaurante fechado para novos pedidos." }, { status: 409 });
  }

  if (tipoEntrega === "retirada" && row.retirada_balcao !== true) {
    return NextResponse.json(
      { error: "Este restaurante não oferece retirada no balcão." },
      { status: 400 },
    );
  }

  const observacoesBase = sanitizeObservacoesVitrine(
    (tipoEntrega === "retirada" ? PREFIXO_OBS_BALCAO : "") + obsSan,
    12_000,
  );

  const funcionamento_semana = parseFuncionamentoSemana(row.funcionamento_semana) ?? undefined;
  const horarioStub = { funcionamento_semana } as Restaurante;
  if (statusAberturaPorRelogio(horarioStub) === "fechado") {
    return NextResponse.json({ error: "Fora do horário de atendimento." }, { status: 409 });
  }

  const pratoIds = [...new Set(linhas.map((l) => l.pratoId))];
  const { data: pratosRows, error: prErr } = await admin
    .from("pratos")
    .select("id, nome, preco, status, categoria")
    .eq("restaurante_id", restauranteId)
    .in("id", pratoIds);

  if (prErr) {
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
    logStructured("warn", "api.pedidos.vitrine.calculo_invalido", {
      restauranteId,
      error: tot.error,
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
    .maybeSingle();

  if (insErr) {
    logStructured("error", "api.pedidos.vitrine.insert", {
      restauranteId,
      code: insErr.code,
      message: insErr.message,
    });
    return NextResponse.json(
      { error: "Não foi possível registrar o pedido. Tente novamente em instantes." },
      { status: 500 },
    );
  }

  logStructured("info", "api.pedidos.vitrine.ok", {
    restauranteId,
    pedidoId: inserted?.id ?? null,
    total: tot.total,
    linhas: linhas.length,
  });

  return NextResponse.json(
    { ok: true, id: inserted?.id ?? null },
    { headers: { "Content-Type": "application/json; charset=utf-8" } },
  );
}
