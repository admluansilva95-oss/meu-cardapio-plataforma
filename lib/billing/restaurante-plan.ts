import { getPlanByPriceId, type Plan, type PlanId } from "@/lib/plans";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { logStructured } from "@/lib/logging/structured-log";

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

export async function countPedidosMesAtual(restauranteId: string): Promise<number | null> {
  const admin = createAdminSupabaseClient();
  if (!admin) return null;

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const { count, error } = await admin
    .from("pedidos")
    .select("id", { count: "exact", head: true })
    .eq("restaurante_id", restauranteId)
    .gte("criado_em", start.toISOString());

  if (error) {
    logStructured("warn", "billing.pedidos_mes_count_failed", {
      restauranteId,
      code: error.code ?? null,
    });
    return null;
  }

  return count ?? 0;
}

/**
 * Bloqueia novos pedidos da vitrine só quando o plano Essencial excede o teto mensal.
 * Falha aberta em erro de consulta — não interrompe operação por instabilidade.
 */
export async function assertPodeRegistrarPedidoVitrine(
  restauranteId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const entitlements = await resolveRestaurantePlan(restauranteId);
  if (entitlements.monthlyOrderLimit == null) {
    return { ok: true };
  }

  const count = await countPedidosMesAtual(restauranteId);
  if (count === null) {
    return { ok: true };
  }

  if (count >= entitlements.monthlyOrderLimit) {
    return {
      ok: false,
      status: 429,
      error: `Limite mensal de ${entitlements.monthlyOrderLimit} pedidos do plano Essencial atingido. Entre em contato para fazer upgrade.`,
    };
  }

  return { ok: true };
}
