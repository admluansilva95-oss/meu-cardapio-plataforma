import { SUPABASE_OWNER_AUTH_STORAGE_KEY } from "@/lib/auth/supabase-session-cookies";

/** Cookies de sessão do dono (`createBrowserClient` + `auth.storageKey` na app). */
export function countOwnerAuthSessionCookies(cookies: readonly { name: string }[]): number {
  const p = SUPABASE_OWNER_AUTH_STORAGE_KEY;
  return cookies.filter((c) => c.name === p || c.name.startsWith(`${p}.`)).length;
}
