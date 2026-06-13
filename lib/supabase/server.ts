import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { latin1CookieWrite } from "@/lib/http/byte-string-http";
import { serverLatin1SafeFetch } from "@/lib/http/server-latin1-fetch";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Cliente Supabase para Server Components, Route Handlers e Server Actions.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach((raw) => {
              const { name, value, options } = latin1CookieWrite(raw);
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll pode falhar em Server Components estáticos; ignorar.
          }
        },
      },
      global: { fetch: serverLatin1SafeFetch },
    },
  );
}
