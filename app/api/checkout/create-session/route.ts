import { NextResponse } from "next/server";
import { createSubscriptionCheckoutSession } from "@/lib/billing/checkout";
import { requireAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CheckoutBody = {
  priceId?: string;
  userId?: string;
  slug?: string;
  restaurantName?: string;
  whatsapp?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CheckoutBody;
    const { priceId, userId, slug, restaurantName, whatsapp } = body;

    if (!priceId || typeof priceId !== "string") {
      return NextResponse.json({ error: "priceId é obrigatório." }, { status: 400 });
    }

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "userId é obrigatório." }, { status: 400 });
    }

    if (!slug || typeof slug !== "string") {
      return NextResponse.json({ error: "slug é obrigatório." }, { status: 400 });
    }

    if (!restaurantName || typeof restaurantName !== "string") {
      return NextResponse.json({ error: "restaurantName é obrigatório." }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const authHeader = request.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    const {
      data: { user },
      error: authError,
    } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (authError || !user) {
      console.error("[checkout/create-session] auth:", authError?.message ?? "no user");
      return NextResponse.json(
        { error: "Sessão inválida ou expirada." },
        { status: 401 }
      );
    }

    if (user.id !== userId) {
      console.error("[checkout/create-session] userId mismatch");
      return NextResponse.json(
        { error: "Usuário não autorizado para esta operação." },
        { status: 403 }
      );
    }

    let admin;
    try {
      admin = requireAdminSupabaseClient();
    } catch (err) {
      console.error("[checkout/create-session] admin:", err);
      return NextResponse.json(
        { error: "Configuração do servidor incompleta." },
        { status: 500 }
      );
    }

    const result = await createSubscriptionCheckoutSession(admin, {
      userId: user.id,
      userEmail: user.email,
      priceId,
      slug,
      restaurantName,
      whatsapp: typeof whatsapp === "string" ? whatsapp : undefined,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ url: result.url });
  } catch (err) {
    console.error("[checkout/create-session] unexpected:", err);
    return NextResponse.json(
      { error: "Erro interno ao criar sessão de checkout." },
      { status: 500 }
    );
  }
}
