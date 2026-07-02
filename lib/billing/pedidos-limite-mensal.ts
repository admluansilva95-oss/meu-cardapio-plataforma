import type { PlanId } from "@/lib/plans";
import {
  ESSENCIAL_MONTHLY_ORDER_LIMIT,
  ESSENCIAL_PEDIDOS_AVISO_PERCENT,
} from "@/lib/plans";
import { resolveRestaurantePlan } from "@/lib/billing/restaurante-plan";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { logStructured } from "@/lib/logging/structured-log";

export type LimitePedidosEstado = "sem_limite" | "aviso_80" | "limite_atingido";

export type LimitePedidosMensalSnapshot = {
  estado: LimitePedidosEstado;
  pedidosNoMes: number | null;
  limite: number | null;
  percentualAtual: number | null;
  bloqueiaNovosPedidos: boolean;
};

const PEDIDOS_AVISO_MINIMO = Math.floor(
  (ESSENCIAL_MONTHLY_ORDER_LIMIT * ESSENCIAL_PEDIDOS_AVISO_PERCENT) / 100,
);

/** `true` quando `atual` atinge o patamar de aviso (80% → 120 em limite 150). */
export function calcularPedidosAvisoLimite(atual: number): boolean {
  return atual >= PEDIDOS_AVISO_MINIMO;
}

export function resolverEstadoLimitePedidos(
  atual: number,
  plano: PlanId | "unknown",
): LimitePedidosEstado {
  if (plano !== "essencial") return "sem_limite";
  if (atual >= ESSENCIAL_MONTHLY_ORDER_LIMIT) return "limite_atingido";
  if (calcularPedidosAvisoLimite(atual)) return "aviso_80";
  return "sem_limite";
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

function calcularPercentualAtual(pedidosNoMes: number, limite: number): number {
  return Math.min(100, Math.round((pedidosNoMes / limite) * 100));
}

/**
 * Avalia uso mensal vs. plano Essencial (150 pedidos/mês, aviso em 120).
 * Premium / plano desconhecido → `sem_limite` (fail-open em erro de contagem).
 */
export async function avaliarLimitePedidosMensal(
  restauranteId: string,
): Promise<LimitePedidosMensalSnapshot> {
  const entitlements = await resolveRestaurantePlan(restauranteId);
  const pedidosNoMes = await countPedidosMesAtual(restauranteId);

  if (entitlements.planId !== "essencial") {
    return {
      estado: "sem_limite",
      pedidosNoMes,
      limite: null,
      percentualAtual: null,
      bloqueiaNovosPedidos: false,
    };
  }

  const limite = ESSENCIAL_MONTHLY_ORDER_LIMIT;

  if (pedidosNoMes === null) {
    return {
      estado: "sem_limite",
      pedidosNoMes: null,
      limite,
      percentualAtual: null,
      bloqueiaNovosPedidos: false,
    };
  }

  const estado = resolverEstadoLimitePedidos(pedidosNoMes, "essencial");

  return {
    estado,
    pedidosNoMes,
    limite,
    percentualAtual: calcularPercentualAtual(pedidosNoMes, limite),
    bloqueiaNovosPedidos: estado === "limite_atingido",
  };
}
