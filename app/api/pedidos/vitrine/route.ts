import { NextResponse } from "next/server";
import { parseFuncionamentoSemana } from "@/lib/restaurante/funcionamento-semana";
import { statusAberturaPorRelogio } from "@/lib/restaurante/horario-vitrine";
import { latin1SafeString } from "@/lib/restaurante/json-latin1-wire";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Restaurante } from "@/types";

/**
 * Pedidos da vitrine → tabela PostgreSQL `public.pedidos` (não existe tabela `orders` neste projeto).
 * Estado inicial da esteira: `coluna = 'recebidos'` (fila de novos pedidos).
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
  total?: number;
  formaPagamento?: FormaCheckout;
  itens?: unknown;
  /** Texto resumo para o painel (sem bullets U+2022); o cliente monta o WhatsApp à parte. */
  observacoes?: string;
  /** `retirada` = retirada no balcão (exige `restaurantes.retirada_balcao`). */
  tipoEntrega?: string;
};

const PREFIXO_OBS_BALCAO =
  "=== RETIRADA NO BALCAO ===\n" +
  "NAO enviar para entrega: cliente retira no estabelecimento.\n" +
  "Acompanhe na esteira ate disponibilizar para retirada no balcao.\n\n";

/** UUID v4 (e variantes comuns) enviado em `restaurantes.id`. */
function isUuidRestauranteId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

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

type RestaurantePedidoRow = {
  id: string;
  vitrine_fechada?: boolean | null;
  funcionamento_semana?: unknown;
  retirada_balcao?: boolean | null;
};

/**
 * Registra pedido originado na vitrine (antes do cliente abrir o WhatsApp).
 * Requer `SUPABASE_SERVICE_ROLE_KEY` no servidor (bypass RLS seguro).
 */
export async function POST(request: Request) {
  const admin = createAdminSupabaseClient();
  if (!admin) {
    console.error(
      "[api/pedidos/vitrine] SUPABASE_SERVICE_ROLE_KEY ausente — não é possível gravar o pedido.",
    );
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
  const total =
    typeof body.total === "number" && Number.isFinite(body.total)
      ? Math.max(0, Math.round(body.total * 100) / 100)
      : NaN;
  const forma = body.formaPagamento;

  if (!restauranteId || !cliente || cliente.length < 2) {
    return NextResponse.json({ error: "Dados do cliente inválidos." }, { status: 400 });
  }
  if (!isUuidRestauranteId(restauranteId)) {
    return NextResponse.json({ error: "Identificador do estabelecimento inválido." }, { status: 400 });
  }
  if (!telefone || telefone.length < 8) {
    return NextResponse.json({ error: "Telefone inválido." }, { status: 400 });
  }
  if (!Number.isFinite(total)) {
    return NextResponse.json({ error: "Total inválido." }, { status: 400 });
  }
  if (
    forma !== "dinheiro" &&
    forma !== "pix" &&
    forma !== "cartao_debito" &&
    forma !== "cartao_credito"
  ) {
    return NextResponse.json({ error: "Forma de pagamento inválida." }, { status: 400 });
  }

  let itensJson: string[] = [];
  if (Array.isArray(body.itens)) {
    itensJson = body.itens
      .map((x) => (typeof x === "string" ? latin1SafeString(x.trim()) : ""))
      .filter(Boolean)
      .slice(0, 80);
  }
  if (itensJson.length === 0) {
    return NextResponse.json({ error: "Lista de itens vazia." }, { status: 400 });
  }

  const obsRaw = typeof body.observacoes === "string" ? body.observacoes : "";
  const obsSan = latin1SafeString(
    obsRaw.length > 12000 ? obsRaw.slice(0, 12000) : obsRaw,
  ).slice(0, 12000);

  const tipoEntrega =
    body.tipoEntrega === "retirada" || body.tipoEntrega === "entrega" ? body.tipoEntrega : "entrega";

  let rest: RestaurantePedidoRow | null = null;

  const selectCompleto = await admin
    .from("restaurantes")
    .select("id, vitrine_fechada, funcionamento_semana, retirada_balcao")
    .eq("id", restauranteId)
    .maybeSingle();

  if (selectCompleto.error) {
    if (isSchemaOrUnknownColumnError(selectCompleto.error)) {
      console.warn(
        "[api/pedidos/vitrine] select restaurante (completo) coluna ausente — tentando select mínimo:",
        selectCompleto.error.message,
      );
      const selectMinimo = await admin
        .from("restaurantes")
        .select("id, vitrine_fechada")
        .eq("id", restauranteId)
        .maybeSingle();

      if (selectMinimo.error) {
        if (isSchemaOrUnknownColumnError(selectMinimo.error)) {
          console.warn(
            "[api/pedidos/vitrine] select mínimo falhou — tentando só id:",
            selectMinimo.error.message,
          );
          const soId = await admin.from("restaurantes").select("id").eq("id", restauranteId).maybeSingle();
          if (soId.error || !soId.data) {
            console.error("[api/pedidos/vitrine] select id:", soId.error);
            return NextResponse.json(
              { error: "Erro interno ao consultar o estabelecimento." },
              { status: 500 },
            );
          }
          rest = {
            id: soId.data.id,
            vitrine_fechada: false,
            funcionamento_semana: undefined,
            retirada_balcao: false,
          };
        } else {
          console.error("[api/pedidos/vitrine] select restaurante (mínimo):", selectMinimo.error);
          return NextResponse.json(
            { error: "Erro interno ao consultar o estabelecimento." },
            { status: 500 },
          );
        }
      } else if (!selectMinimo.data) {
        return NextResponse.json({ error: "Restaurante não encontrado." }, { status: 404 });
      } else {
        rest = {
          id: selectMinimo.data.id,
          vitrine_fechada: selectMinimo.data.vitrine_fechada,
          funcionamento_semana: undefined,
          retirada_balcao: false,
        };
      }
    } else {
      const msg = (selectCompleto.error.message ?? "").toLowerCase();
      if (msg.includes("invalid input syntax for type uuid") || msg.includes("22p02")) {
        return NextResponse.json({ error: "Identificador do estabelecimento inválido." }, { status: 400 });
      }
      console.error("[api/pedidos/vitrine] select restaurante:", selectCompleto.error);
      return NextResponse.json(
        { error: "Erro interno ao consultar o estabelecimento." },
        { status: 500 },
      );
    }
  } else if (!selectCompleto.data) {
    return NextResponse.json({ error: "Restaurante não encontrado." }, { status: 404 });
  } else {
    rest = selectCompleto.data as RestaurantePedidoRow;
  }

  const row = rest;
  if (row.vitrine_fechada === true) {
    return NextResponse.json({ error: "Restaurante fechado para novos pedidos." }, { status: 409 });
  }

  if (tipoEntrega === "retirada" && row.retirada_balcao !== true) {
    return NextResponse.json(
      { error: "Este restaurante não oferece retirada no balcão." },
      { status: 400 },
    );
  }

  const observacoes = latin1SafeString(
    (tipoEntrega === "retirada" ? PREFIXO_OBS_BALCAO : "") + obsSan,
  ).slice(0, 12000);

  const funcionamento_semana = parseFuncionamentoSemana(row.funcionamento_semana) ?? undefined;
  const horarioStub = { funcionamento_semana } as Restaurante;
  if (statusAberturaPorRelogio(horarioStub) === "fechado") {
    return NextResponse.json({ error: "Fora do horário de atendimento." }, { status: 409 });
  }

  const pagamento = mapPagamentoPedidoDb(forma);

  const { data: inserted, error: insErr } = await admin
    .from("pedidos")
    .insert({
      restaurante_id: restauranteId,
      cliente,
      telefone,
      total,
      pagamento,
      coluna: "recebidos",
      observacoes,
      itens: itensJson,
      motoboy: "",
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    console.error("[api/pedidos/vitrine] insert pedidos falhou:", {
      code: insErr.code,
      message: insErr.message,
      details: insErr.details,
      hint: insErr.hint,
      raw: insErr,
    });
    return NextResponse.json(
      { error: "Não foi possível registrar o pedido. Tente novamente em instantes." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true, id: inserted?.id ?? null },
    { headers: { "Content-Type": "application/json; charset=utf-8" } },
  );
}
