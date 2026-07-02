import { getPlanByPriceId, type Plan, type PlanId } from "@/lib/plans";
import { avaliarLimitePedidosMensal, countPedidosMesAtual } from "@/lib/billing/pedidos-limite-mensal";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type RestaurantePlanResolution = {
  planId: PlanId | "unknown";
  plan: Plan | null;
  monthlyOrderLimit: number | null;
  kanbanEnabled: boolean;
};

const OPEN_ENTITLEMENTS: RestaurantePlanResolution = {
  planId: "unknown",
  plan: null,
  monthlyOrderLimit: null,
  kanbanEnabled: true,
};

/**
 * Resolve o plano ativo do dono do restaurante.
 * Sem `price_id` ou plano desconhecido → não restringe (clientes legados / migração).
 */
export async function resolveRestaurantePlan(
  restauranteId: string,
): Promise<RestaurantePlanResolution> {
  const admin = createAdminSupabaseClient();
  if (!admin) return OPEN_ENTITLEMENTS;

  const { data: rest, error: restErr } = await admin
    .from("restaurantes")
    .select("owner_id")
    .eq("id", restauranteId)
    .maybeSingle();

  if (restErr || !rest?.owner_id) {
    return OPEN_ENTITLEMENTS;
  }

  const { data: sub, error: subErr } = await admin
    .from("assinaturas")
    .select("price_id, status")
    .eq("user_id", rest.owner_id)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subErr || !sub?.price_id) {
    return OPEN_ENTITLEMENTS;
  }

  const plan = getPlanByPriceId(sub.price_id);
  if (!plan) {
    return OPEN_ENTITLEMENTS;
  }

  return {
    planId: plan.id,
    plan,
    monthlyOrderLimit: plan.monthlyOrderLimit,
    kanbanEnabled: plan.id === "premium",
  };
}

export { countPedidosMesAtual };

/**
 * Bloqueia novos pedidos da vitrine só quando o plano Essencial excede o teto mensal.
 * Falha aberta em erro de consulta — não interrompe operação por instabilidade.
 */
export async function assertPodeRegistrarPedidoVitrine(
  restauranteId: string,
): Promise<
  | { ok: true }
  | { ok: false; status: number; code: "limite_atingido"; error: string }
> {
  const limite = await avaliarLimitePedidosMensal(restauranteId);
  if (!limite.bloqueiaNovosPedidos) {
    return { ok: true };
  }

  return {
    ok: false,
    status: 429,
    code: "limite_atingido",
    error: "Limite de pedidos do plano atingido",
  };
}
