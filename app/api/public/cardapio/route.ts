import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isValidSlug } from "@/lib/billing/slug";
import { serverLatin1SafeFetch } from "@/lib/http/server-latin1-fetch";
import { logStructured } from "@/lib/logging/structured-log";
import {
  SUPABASE_PUBLIC_CARDAPIO_TIMEOUT_MS,
  isSupabaseQueryTimeoutLike,
  supabaseQuerySignal,
} from "@/lib/supabase/query-timeouts";

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
  const slug = request.nextUrl.searchParams.get("slug")?.trim() ?? "";
  if (!slug || !isValidSlug(slug)) {
    return NextResponse.json({ error: "Slug inválido." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    return NextResponse.json(
      { error: "Configuração do servidor incompleta (Supabase)." },
      { status: 503 },
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

  const signalCardapio = supabaseQuerySignal(SUPABASE_PUBLIC_CARDAPIO_TIMEOUT_MS);

  const { data: restaurante, error: restErr } = await supabase
    .from("restaurantes")
    .select(RESTAURANTE_COLUNAS)
    .eq("slug", slug)
    .abortSignal(signalCardapio)
    .maybeSingle();

  if (restErr) {
    if (isSupabaseQueryTimeoutLike(restErr)) {
      logStructured("error", "api.public.cardapio.restaurantes_timeout", { slug });
      return NextResponse.json(
        { error: "O servidor demorou a responder. Tente novamente em instantes." },
        { status: 504 },
      );
    }
    logStructured("error", "api.public.cardapio.restaurantes", {
      slug,
      message: restErr.message,
      code: restErr.code,
    });
    return NextResponse.json(
      { error: "Não foi possível carregar o cardápio. Tente novamente em instantes." },
      { status: 500 },
    );
  }

  if (!restaurante) {
    const res = NextResponse.json({ restaurante: null, pratos: [] });
    res.headers.set("Cache-Control", "private, no-store, max-age=0");
    return res;
  }

  const rid = (restaurante as { id: string }).id;

  const signalPratos = supabaseQuerySignal(SUPABASE_PUBLIC_CARDAPIO_TIMEOUT_MS);

  const { data: pratos, error: pratosErr } = await supabase
    .from("pratos")
    .select(PRATOS_COLUNAS)
    .eq("restaurante_id", rid)
    .eq("status", "ativo")
    .order("nome", { ascending: true })
    .abortSignal(signalPratos);

  if (pratosErr) {
    if (isSupabaseQueryTimeoutLike(pratosErr)) {
      logStructured("error", "api.public.cardapio.pratos_timeout", { slug, restauranteId: rid });
      return NextResponse.json(
        { error: "O servidor demorou a responder. Tente novamente em instantes." },
        { status: 504 },
      );
    }
    logStructured("error", "api.public.cardapio.pratos", {
      slug,
      restauranteId: rid,
      message: pratosErr.message,
      code: pratosErr.code,
    });
    return NextResponse.json(
      { error: "Não foi possível carregar o cardápio. Tente novamente em instantes." },
      { status: 500 },
    );
  }

  const res = NextResponse.json({
    restaurante,
    pratos: pratos ?? [],
  });
  res.headers.set("Cache-Control", "private, no-store, max-age=0");
  return res;
}
