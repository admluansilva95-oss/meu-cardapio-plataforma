import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SUPABASE_CLIENT_AUTH_STORAGE_KEY,
  SUPABASE_OWNER_AUTH_STORAGE_KEY,
} from "@/lib/auth/supabase-session-cookies";

function removeStorageKeysForAuth(storage: Storage): void {
  const keys = Object.keys(storage);
  for (const key of keys) {
    const lower = key.toLowerCase();
    if (
      key === SUPABASE_OWNER_AUTH_STORAGE_KEY ||
      key === SUPABASE_CLIENT_AUTH_STORAGE_KEY ||
      key.startsWith(`${SUPABASE_OWNER_AUTH_STORAGE_KEY}.`) ||
      key.startsWith(`${SUPABASE_CLIENT_AUTH_STORAGE_KEY}.`) ||
      key.startsWith(`${SUPABASE_OWNER_AUTH_STORAGE_KEY}-`) ||
      key.startsWith(`${SUPABASE_CLIENT_AUTH_STORAGE_KEY}-`) ||
      key === "supabase.auth.token" ||
      key.startsWith("supabase.auth.token.") ||
      lower.includes("supabase") ||
      (key.startsWith("sb-") && lower.includes("auth"))
    ) {
      storage.removeItem(key);
    }
  }
}

/**
 * Apaga artefatos de auth no browser (storage + cookies visíveis ao JS).
 * Complementa `signOut` do Supabase quando há estado residual ou cookies legados.
 */
export function clearBrowserAuthArtifacts(): void {
  if (typeof window === "undefined") return;
  try {
    removeStorageKeysForAuth(window.localStorage);
    removeStorageKeysForAuth(window.sessionStorage);
  } catch {
    /* storage pode estar indisponível (modo privado restrito, etc.) */
  }

  const secure = window.location.protocol === "https:";
  const secureSuffix = secure ? "; Secure" : "";
  try {
    const parts = document.cookie.split(";").map((c) => c.trim());
    for (const part of parts) {
      if (!part) continue;
      const eq = part.indexOf("=");
      const name = (eq === -1 ? part : part.slice(0, eq)).trim();
      if (!name) continue;
      const lower = name.toLowerCase();
      const isAuthLike =
        name === SUPABASE_OWNER_AUTH_STORAGE_KEY ||
        name === SUPABASE_CLIENT_AUTH_STORAGE_KEY ||
        name.startsWith(`${SUPABASE_OWNER_AUTH_STORAGE_KEY}.`) ||
        name.startsWith(`${SUPABASE_CLIENT_AUTH_STORAGE_KEY}.`) ||
        name.startsWith(`${SUPABASE_OWNER_AUTH_STORAGE_KEY}-`) ||
        name.startsWith(`${SUPABASE_CLIENT_AUTH_STORAGE_KEY}-`) ||
        name === "supabase.auth.token" ||
        name.startsWith("supabase.auth.token.") ||
        name.includes("code-verifier") ||
        (name.startsWith("sb-") && lower.includes("auth"));
      if (!isAuthLike) continue;
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${secureSuffix}`;
    }
  } catch {
    /* ignore */
  }
}

/**
 * Logout do dono: encerra sessão no Supabase e limpa storage/cookies locais.
 * Preferir `window.location.assign` após esta função para um reset completo da árvore React.
 */
export async function performOwnerLogout(supabase: SupabaseClient): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    /* rede / tab já fechada: seguimos com limpeza local */
  }
  clearBrowserAuthArtifacts();
}
