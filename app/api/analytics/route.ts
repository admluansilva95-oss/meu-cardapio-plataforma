import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { logStructured } from "@/lib/logging/structured-log";
import { runApiWithAccessLog } from "@/lib/http/run-api-with-access-log";

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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
}

export async function POST(request: NextRequest) {
  return runApiWithAccessLog(
    request,
    "/api/analytics",
    "api.analytics.fatal",
    async () => {
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) {
        return new NextResponse(null, { status: 413 });
      }
      let body: unknown;
      try {
        body = JSON.parse(raw) as unknown;
      } catch {
        return new NextResponse(null, { status: 400 });
      }
      if (!body || typeof body !== "object") {
        return new NextResponse(null, { status: 400 });
      }
      const o = body as Record<string, unknown>;
      const event = typeof o.event === "string" ? o.event.trim() : "";
      if (!ALLOWED_EVENTS.has(event)) {
        return new NextResponse(null, { status: 400 });
      }

      const slug =
        typeof o.slug === "string" ? o.slug.trim().slice(0, 200) : "";
      const pratoId = typeof o.pratoId === "string" ? o.pratoId.trim() : "";
      const pedidoId = typeof o.pedidoId === "string" ? o.pedidoId.trim() : "";

      if (pratoId && !isUuidLike(pratoId)) {
        return new NextResponse(null, { status: 400 });
      }
      if (pedidoId && !isUuidLike(pedidoId)) {
        return new NextResponse(null, { status: 400 });
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

      return new NextResponse(null, { status: 204 });
    },
  );
}
