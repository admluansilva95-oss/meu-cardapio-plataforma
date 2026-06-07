import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com service role — usar apenas em Route Handlers / jobs server-side.
 */
export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return null;
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store" }),
    },
  });
}

/** Exige service role — use em webhooks e jobs que ignoram RLS. */
export function requireAdminSupabaseClient() {
  const client = createAdminSupabaseClient();
  if (!client) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_URL ausentes."
    );
  }
  return client;
}
