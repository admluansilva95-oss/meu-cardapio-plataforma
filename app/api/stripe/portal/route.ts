import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  getOwnerAuthStorageOptions,
  getSupabaseServerCookieOptions,
} from "@/lib/auth/supabase-session-cookies";
import { latin1CookieWrite } from "@/lib/http/byte-string-http";
import { getStripe } from "@/lib/stripe/client";
import { getPublicAppUrl } from "@/lib/site-url";
import { requireAdminSupabaseClient } from "@/lib/supabase/admin";
import { serverLatin1SafeFetch } from "@/lib/http/server-latin1-fetch";
import { getPublicSupabaseProjectUrl } from "@/lib/supabase/normalize-public-supabase-url";
import { resolveStripeId } from "@/lib/billing/assinaturas";

export const dynamic = "force-dynamic";

type CookieToSet = { name: string; value: string; options: CookieOptions };

async function resolveAuthenticatedUser(request: NextRequest) {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    getPublicSupabaseProjectUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: getSupabaseServerCookieOptions(),
      ...getOwnerAuthStorageOptions(),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach((raw) => {
            const { name, value, options } = latin1CookieWrite(raw);
            request.cookies.set(name, value);
            try {
              cookieStore.set(name, value, options);
            } catch {
              /* ignore */
            }
          });
        },
      },
      global: { fetch: serverLatin1SafeFetch },
    },
  );

  const bearerToken = request.headers.get("Authorization")?.startsWith("Bearer ")
    ? request.headers.get("Authorization")!.slice(7).trim()
    : null;

  let user = null as Awaited<
    ReturnType<typeof supabase.auth.getUser>
  >["data"]["user"];

  if (bearerToken) {
    const {
      data: { user: bearerUser },
      error: bearerError,
    } = await supabase.auth.getUser(bearerToken);
    if (!bearerError && bearerUser) user = bearerUser;
  }

  if (!user) {
    const {
      data: { user: cookieUser },
      error: cookieError,
    } = await supabase.auth.getUser();
    if (!cookieError && cookieUser) user = cookieUser;
  }

  return user;
}

export async function POST(request: NextRequest) {
  try {
    const user = await resolveAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const admin = requireAdminSupabaseClient();
    const { data: assinatura, error: assinaturaError } = await admin
      .from("assinaturas")
      .select("stripe_customer_id, stripe_subscription_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (assinaturaError) {
      console.error("[api/stripe/portal] consulta assinaturas:", assinaturaError.message);
      return NextResponse.json(
        { error: "Não foi possível consultar sua assinatura." },
        { status: 500 },
      );
    }

    let customerId = assinatura?.stripe_customer_id?.trim() || null;

    if (!customerId && assinatura?.stripe_subscription_id) {
      const stripe = getStripe();
      const subscription = await stripe.subscriptions.retrieve(
        assinatura.stripe_subscription_id,
      );
      customerId = resolveStripeId(subscription.customer);
    }

    if (!customerId) {
      return NextResponse.json(
        {
          error:
            "Cliente Stripe não encontrado. Conclua o checkout da assinatura antes de gerenciar o plano.",
        },
        { status: 404 },
      );
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getPublicAppUrl()}/admin`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe não retornou URL do portal de cobrança." },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    console.error("Erro ao criar portal do Stripe:", error);
    const message =
      error instanceof Error ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
