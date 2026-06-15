import { createClient } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";
import { isValidSlug } from "@/lib/billing/slug";
import { serverLatin1SafeFetch } from "@/lib/http/server-latin1-fetch";
import { jsonWithRequestId } from "@/lib/http/json-with-request-id";
import { logStructured } from "@/lib/logging/structured-log";
import {
  SUPABASE_PUBLIC_CARDAPIO_TIMEOUT_MS,
  isSupabaseQueryTimeoutLike,
  supabaseQuerySignal,
} from "@/lib/supabase/query-timeouts";
import { runApiWithAccessLog } from "@/lib/http/run-api-with-access-log";
import { getPublicSupabaseProjectUrl } from "@/lib/supabase/normalize-public-supabase-url";

export const dynamic = "force-dynamic";

/**
 * Colunas usadas pela vitrine pública. Lista explícita evita surpresas com `select('*')`
 * e garante leitura só com cliente anônimo (sem sessão do painel no navegador).
 */
const RESTAURANTE_COLUNAS =
  "id, nome, slug, whatsapp, logo, cor_tema, horario_funcionamento, taxa_entrega, vitrine_fechada, mensagem_fechado, funcionamento_semana, taxas_entrega_zonas, entrega_modo, retirada_balcao, cardapio_categorias, mensagem_boas_vindas, texto_vitrine_aberto, texto_vitrine_fechado, mensagem_fora_horario" as const;

const PRATOS_COLUNAS =
  "id, restaurante_id, nome, preco, descricao, imagem, status, categoria" as const;

/**
 * GET /api/public/cardapio?slug=meu-restaurante
 * Dados do estabelecimento + pratos ativos para o cardápio público (sem cookies de auth).
 */
export async function GET(request: NextRequest) {
  return runApiWithAccessLog(
    request,
    "/api/public/cardapio",
    "api.public.cardapio.fatal",
    async ({ request, requestId }) => {
      const req = request as NextRequest;
      const slug = req.nextUrl.searchParams.get("slug")?.trim() ?? "";
      if (!slug || !isValidSlug(slug)) {
        return jsonWithRequestId(requestId, { error: "Slug inválido." }, 400);
      }

      const url = getPublicSupabaseProjectUrl();
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
      if (!url || !anonKey) {
        return jsonWithRequestId(
          requestId,
          { error: "Configuração do servidor incompleta (Supabase)." },
          503,
        );
      }

      const supabase = createClient(url, anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: { fetch: serverLatin1SafeFetch },
      });

      const signalCardapio = supabaseQuerySignal(
        SUPABASE_PUBLIC_CARDAPIO_TIMEOUT_MS,
      );

      const { data: restaurante, error: restErr } = await supabase
        .from("restaurantes")
        .select(RESTAURANTE_COLUNAS)
        .eq("slug", slug)
        .abortSignal(signalCardapio)
        .maybeSingle();

      if (restErr) {
        if (isSupabaseQueryTimeoutLike(restErr)) {
          logStructured("error", "api.public.cardapio.restaurantes_timeout", {
            slug,
          });
          return jsonWithRequestId(
            requestId,
            {
              error:
                "O servidor demorou a responder. Tente novamente em instantes.",
            },
            504,
          );
        }
        logStructured("error", "api.public.cardapio.restaurantes", {
          slug,
          message: restErr.message,
          code: restErr.code,
        });
        return jsonWithRequestId(
          requestId,
          {
            error:
              "Não foi possível carregar o cardápio. Tente novamente em instantes.",
          },
          500,
        );
      }

      if (!restaurante) {
        const res = jsonWithRequestId(requestId, { restaurante: null, pratos: [] }, 200);
        res.headers.set("Cache-Control", "private, no-store, max-age=0");
        return res;
      }

      const rid = (restaurante as { id: string }).id;

      const signalPratos = supabaseQuerySignal(
        SUPABASE_PUBLIC_CARDAPIO_TIMEOUT_MS,
      );

      const { data: pratos, error: pratosErr } = await supabase
        .from("pratos")
        .select(PRATOS_COLUNAS)
        .eq("restaurante_id", rid)
        .eq("status", "ativo")
        .order("nome", { ascending: true })
        .abortSignal(signalPratos);

      if (pratosErr) {
        if (isSupabaseQueryTimeoutLike(pratosErr)) {
          logStructured("error", "api.public.cardapio.pratos_timeout", {
            slug,
            restauranteId: rid,
          });
          return jsonWithRequestId(
            requestId,
            {
              error:
                "O servidor demorou a responder. Tente novamente em instantes.",
            },
            504,
          );
        }
        logStructured("error", "api.public.cardapio.pratos", {
          slug,
          restauranteId: rid,
          message: pratosErr.message,
          code: pratosErr.code,
        });
        return jsonWithRequestId(
          requestId,
          {
            error:
              "Não foi possível carregar o cardápio. Tente novamente em instantes.",
          },
          500,
        );
      }

      const res = jsonWithRequestId(
        requestId,
        {
          restaurante,
          pratos: pratos ?? [],
        },
        200,
      );
      res.headers.set("Cache-Control", "private, no-store, max-age=0");
      return res;
    },
  );
}
