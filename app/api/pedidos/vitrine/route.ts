import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

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
  /** Texto completo enviado ao WhatsApp (resumo do pedido). */
  observacoes?: string;
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
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean)
      .slice(0, 80);
  }
  if (itensJson.length === 0) {
    return NextResponse.json({ error: "Lista de itens vazia." }, { status: 400 });
  }

  const obsRaw = typeof body.observacoes === "string" ? body.observacoes : "";
  const observacoes = obsRaw.length > 12000 ? obsRaw.slice(0, 12000) : obsRaw;

  const { data: rest, error: restErr } = await admin
    .from("restaurantes")
    .select("id, vitrine_fechada")
    .eq("id", restauranteId)
    .maybeSingle();

  if (restErr) {
    console.error("[api/pedidos/vitrine] select restaurante:", restErr);
    return NextResponse.json({ error: restErr.message }, { status: 500 });
  }
  if (!rest) {
    return NextResponse.json({ error: "Restaurante não encontrado." }, { status: 404 });
  }
  if (rest.vitrine_fechada === true) {
    return NextResponse.json({ error: "Restaurante fechado para novos pedidos." }, { status: 409 });
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
      { error: insErr.message || "Falha ao registrar o pedido no banco." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: inserted?.id ?? null });
}
