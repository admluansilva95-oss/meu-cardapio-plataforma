import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import {
  buildPayloadFromSubscription,
  resolveStripeId,
  upsertAssinatura,
} from "@/lib/billing/assinaturas";
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
import {
  mapStripeErrorForUser,
  stripeKeyModeLabel,
} from "@/lib/stripe/user-facing-errors";

export const dynamic = "force-dynamic";

type CookieToSet = { name: string; value: string; options: CookieOptions };

type AssinaturaBillingRow = {
  id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

type ResolvedBilling = {
  customerId: string;
  subscription: Stripe.Subscription | null;
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
  "past_due",
  "unpaid",
]);

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

function pickPreferredSubscription(
  subscriptions: Stripe.Subscription[],
): Stripe.Subscription | null {
  if (subscriptions.length === 0) return null;
  return (
    subscriptions.find((subscription) => ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status)) ??
    subscriptions[0] ??
    null
  );
}

async function resolveFromSubscriptionId(
  stripe: Stripe,
  subscriptionId: string,
): Promise<ResolvedBilling | null> {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const customerId = resolveStripeId(subscription.customer);
    if (!customerId || !(await customerExists(stripe, customerId))) return null;
    return { customerId, subscription };
  } catch (error) {
    console.warn("[api/stripe/portal] assinatura Stripe inválida:", subscriptionId, error);
    return null;
  }
}

async function resolveFromSubscriptionSearch(
  stripe: Stripe,
  userId: string,
): Promise<ResolvedBilling | null> {
  try {
    const result = await stripe.subscriptions.search({
      query: `metadata['supabase_user_id']:'${userId}'`,
      limit: 10,
    });
    const subscription = pickPreferredSubscription(result.data);
    if (!subscription) return null;

    const customerId = resolveStripeId(subscription.customer);
    if (!customerId || !(await customerExists(stripe, customerId))) return null;
    return { customerId, subscription };
  } catch (error) {
    console.warn("[api/stripe/portal] busca de assinatura por metadata falhou:", error);
    return null;
  }
}

async function resolveFromEmail(
  stripe: Stripe,
  email: string,
  userId: string,
): Promise<ResolvedBilling | null> {
  const customers = await stripe.customers.list({ email, limit: 10 });
  if (customers.data.length === 0) return null;

  const orderedCustomers = [
    ...customers.data.filter((customer) => customer.metadata?.supabase_user_id === userId),
    ...customers.data.filter((customer) => customer.metadata?.supabase_user_id !== userId),
  ];

  for (const customer of orderedCustomers) {
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: "all",
      limit: 10,
    });
    const subscription = pickPreferredSubscription(subscriptions.data);
    if (subscription) {
      return { customerId: customer.id, subscription };
    }
  }

  const fallbackCustomer = orderedCustomers[0];
  if (fallbackCustomer && (await customerExists(stripe, fallbackCustomer.id))) {
    return { customerId: fallbackCustomer.id, subscription: null };
  }

  return null;
}

async function resolveStripeBilling(
  stripe: Stripe,
  assinatura: AssinaturaBillingRow | null,
  user: { id: string; email?: string | null },
): Promise<ResolvedBilling | null> {
  if (assinatura?.stripe_subscription_id) {
    const fromDbSubscription = await resolveFromSubscriptionId(
      stripe,
      assinatura.stripe_subscription_id,
    );
    if (fromDbSubscription) return fromDbSubscription;
  }

  const storedCustomerId = assinatura?.stripe_customer_id?.trim() || null;
  if (storedCustomerId && (await customerExists(stripe, storedCustomerId))) {
    const subscriptions = await stripe.subscriptions.list({
      customer: storedCustomerId,
      status: "all",
      limit: 10,
    });
    return {
      customerId: storedCustomerId,
      subscription: pickPreferredSubscription(subscriptions.data),
    };
  }

  const fromMetadataSearch = await resolveFromSubscriptionSearch(stripe, user.id);
  if (fromMetadataSearch) return fromMetadataSearch;

  if (user.email) {
    return resolveFromEmail(stripe, user.email, user.id);
  }

  return null;
}

async function syncAssinaturaFromStripe(
  admin: ReturnType<typeof requireAdminSupabaseClient>,
  userId: string,
  resolved: ResolvedBilling,
) {
  if (resolved.subscription) {
    const payload = buildPayloadFromSubscription(resolved.subscription, userId);
    await upsertAssinatura(admin, payload);
    return;
  }

  await upsertAssinatura(admin, {
    user_id: userId,
    stripe_customer_id: resolved.customerId,
    status: "active",
  });
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
    const resolved = await resolveStripeBilling(stripe, assinatura, user);

    if (!resolved) {
      const mode = stripeKeyModeLabel();
      return NextResponse.json(
        {
          error:
            `Não encontramos assinatura Stripe para sua conta (modo atual da API: ${mode}). ` +
            "Confira se STRIPE_SECRET_KEY e NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY estão no mesmo ambiente " +
            "(test ou live) em que você pagou. Se acabou de assinar, aguarde alguns segundos e tente de novo.",
        },
        { status: 404 },
      );
    }

    await syncAssinaturaFromStripe(admin, user.id, resolved);

    const session = await stripe.billingPortal.sessions.create({
      customer: resolved.customerId,
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
            `Modo atual da API: ${stripeKeyModeLabel()}. ` +
            "Verifique se as chaves Stripe (test/live) correspondem ao ambiente da assinatura.",
        },
        { status: 409 },
      );
    }

    const message = mapStripeErrorForUser(error, "portal");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
