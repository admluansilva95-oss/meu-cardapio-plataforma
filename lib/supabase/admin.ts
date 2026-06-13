import { createClient } from "@supabase/supabase-js";
import { serverLatin1SafeFetch } from "@/lib/http/server-latin1-fetch";

/**
 * Cliente com service role — usar apenas em Route Handlers / jobs server-side.
 *
 * Segurança: `SUPABASE_SERVICE_ROLE_KEY` não deve existir com prefixo `NEXT_PUBLIC_`
 * nem ser importada por ficheiros `"use client"` / bundles do browser.
 */
export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return null;
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: serverLatin1SafeFetch },
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
