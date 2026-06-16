import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPublicAppUrl } from "@/lib/site-url";

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: assinatura } = await supabase
      .from("assinaturas")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .not("stripe_customer_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!assinatura?.stripe_customer_id) {
      return NextResponse.json(
        { error: "Cliente Stripe não encontrado" },
        { status: 404 },
      );
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: assinatura.stripe_customer_id,
      return_url: `${getPublicAppUrl()}/admin`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    console.error("Erro ao criar portal do Stripe:", error);
    const message =
      error instanceof Error ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
