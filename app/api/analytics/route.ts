import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { logStructured } from "@/lib/logging/structured-log";
import { logProductionApiAccess } from "@/lib/logging/http-access-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_EVENTS = new Set([
  "vitrine.visualizada",
  "vitrine.item_adicionado",
  "vitrine.checkout_iniciado",
  "vitrine.pedido_concluido",
]);

const MAX_BODY_BYTES = 4096;

function isUuidLike(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

export async function POST(request: NextRequest) {
  const started = performance.now();
  let status = 400;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      status = 413;
      return new NextResponse(null, { status });
    }
    let body: unknown;
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      status = 400;
      return new NextResponse(null, { status });
    }
    if (!body || typeof body !== "object") {
      status = 400;
      return new NextResponse(null, { status });
    }
    const o = body as Record<string, unknown>;
    const event = typeof o.event === "string" ? o.event.trim() : "";
    if (!ALLOWED_EVENTS.has(event)) {
      status = 400;
      return new NextResponse(null, { status });
    }

    const slug = typeof o.slug === "string" ? o.slug.trim().slice(0, 200) : "";
    const pratoId = typeof o.pratoId === "string" ? o.pratoId.trim() : "";
    const pedidoId = typeof o.pedidoId === "string" ? o.pedidoId.trim() : "";

    if (pratoId && !isUuidLike(pratoId)) {
      status = 400;
      return new NextResponse(null, { status });
    }
    if (pedidoId && !isUuidLike(pedidoId)) {
      status = 400;
      return new NextResponse(null, { status });
    }

    logStructured("info", "analytics.vitrine", {
      event,
      slug: slug || null,
      hasPratoId: Boolean(pratoId),
      hasPedidoId: Boolean(pedidoId),
    });

    const admin = createAdminSupabaseClient();
    if (admin) {
      const { error } = await admin.from("vitrine_analytics_events").insert({
        event,
        slug: slug || null,
        prato_id: pratoId || null,
        pedido_id: pedidoId || null,
      });
      if (error) {
        logStructured("warn", "analytics.vitrine.persist_skipped", {
          code: error.code ?? null,
        });
      }
    }

    status = 204;
    return new NextResponse(null, { status: 204 });
  } catch {
    status = 500;
    return new NextResponse(null, { status: 500 });
  } finally {
    logProductionApiAccess({
      method: "POST",
      path: "/api/analytics",
      status,
      durationMs: Math.round(performance.now() - started),
    });
  }
}
