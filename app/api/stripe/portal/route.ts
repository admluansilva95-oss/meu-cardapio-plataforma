import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
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

type AssinaturaBillingRow = {
  id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

function isStripeMissingCustomerError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const stripeError = error as { code?: string; message?: string };
  return (
    stripeError.code === "resource_missing" &&
    typeof stripeError.message === "string" &&
    stripeError.message.includes("No such customer")
  );
}

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

async function customerExists(stripe: Stripe, customerId: string): Promise<boolean> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    return !("deleted" in customer && customer.deleted);
  } catch (error) {
    if (isStripeMissingCustomerError(error)) return false;
    throw error;
  }
}

async function resolveCustomerFromSubscription(
  stripe: Stripe,
  subscriptionId: string,
): Promise<string | null> {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return resolveStripeId(subscription.customer);
  } catch (error) {
    console.warn("[api/stripe/portal] assinatura Stripe inválida:", subscriptionId, error);
    return null;
  }
}

async function resolveCustomerByEmail(
  stripe: Stripe,
  email: string,
  userId: string,
): Promise<string | null> {
  const customers = await stripe.customers.list({ email, limit: 10 });
  if (customers.data.length === 0) return null;

  const byMetadata = customers.data.find(
    (customer) => customer.metadata?.supabase_user_id === userId,
  );
  if (byMetadata) return byMetadata.id;

  return customers.data[0]?.id ?? null;
}

async function syncStripeCustomerId(
  admin: ReturnType<typeof requireAdminSupabaseClient>,
  assinaturaId: string,
  customerId: string,
  storedCustomerId: string | null,
) {
  if (storedCustomerId === customerId) return;

  const { error } = await admin
    .from("assinaturas")
    .update({ stripe_customer_id: customerId })
    .eq("id", assinaturaId);

  if (error) {
    console.warn("[api/stripe/portal] falha ao sincronizar stripe_customer_id:", error.message);
  }
}

async function resolveStripeCustomerId(
  stripe: Stripe,
  assinatura: AssinaturaBillingRow | null,
  user: { id: string; email?: string | null },
): Promise<string | null> {
  if (assinatura?.stripe_subscription_id) {
    const fromSubscription = await resolveCustomerFromSubscription(
      stripe,
      assinatura.stripe_subscription_id,
    );
    if (fromSubscription && (await customerExists(stripe, fromSubscription))) {
      return fromSubscription;
    }
  }

  const storedCustomerId = assinatura?.stripe_customer_id?.trim() || null;
  if (storedCustomerId && (await customerExists(stripe, storedCustomerId))) {
    return storedCustomerId;
  }

  if (user.email) {
    const fromEmail = await resolveCustomerByEmail(stripe, user.email, user.id);
    if (fromEmail && (await customerExists(stripe, fromEmail))) {
      return fromEmail;
    }
  }

  return null;
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
      .select("id, stripe_customer_id, stripe_subscription_id")
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

    const stripe = getStripe();
    const customerId = await resolveStripeCustomerId(stripe, assinatura, user);

    if (!customerId) {
      return NextResponse.json(
        {
          error:
            "Não encontramos um cliente Stripe válido para sua conta. " +
            "Isso costuma ocorrer quando a chave STRIPE_SECRET_KEY (test/live) não corresponde " +
            "ao ambiente em que você assinou. Confira as variáveis de ambiente ou refaça o checkout.",
        },
        { status: 404 },
      );
    }

    if (assinatura?.id) {
      await syncStripeCustomerId(
        admin,
        assinatura.id,
        customerId,
        assinatura.stripe_customer_id,
      );
    }

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

    if (isStripeMissingCustomerError(error)) {
      return NextResponse.json(
        {
          error:
            "O cliente Stripe salvo no banco não existe nesta conta Stripe. " +
            "Verifique se STRIPE_SECRET_KEY está no mesmo modo (test ou live) da assinatura original.",
        },
        { status: 409 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
