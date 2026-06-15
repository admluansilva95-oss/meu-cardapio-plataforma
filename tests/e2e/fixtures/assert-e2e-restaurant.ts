import { createClient } from "@supabase/supabase-js";
import { normalizePublicSupabaseUrl } from "../../../lib/supabase/normalize-public-supabase-url";
import { hasE2eAuthCredentials, hasPublicSupabaseEnv } from "./env";

const README = "tests/e2e/README.md (secção «Dados no Supabase»)";

/**
 * Antes dos testes: garante que `E2E_EMAIL` tem pelo menos um `restaurantes.owner_id` = ao user
 * (o mesmo critério que `app/admin/page.tsx` usa para resolver `?slug=`).
 *
 * Defina `E2E_SKIP_RESTAURANT_CHECK=1` se tiver credenciais E2E no ambiente mas só for correr
 * testes que não abrem o painel (evita login extra no global-setup).
 */
export async function assertE2eRestauranteForOwnerOrSlug(): Promise<void> {
  if (process.env.E2E_SKIP_RESTAURANT_CHECK === "1") return;
  if (!hasE2eAuthCredentials() || !hasPublicSupabaseEnv()) return;

  const url = normalizePublicSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!.trim());
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim();
  const email = process.env.E2E_EMAIL!.trim();
  const password = process.env.E2E_PASSWORD!.trim();
  const slugEnv = process.env.E2E_RESTAURANT_SLUG?.trim() ?? "";

  const supabase = createClient(url, anon);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
  if (authErr || !authData.user) {
    // Login falha nos testes de qualquer forma; não bloquear aqui com segunda mensagem.
    await supabase.auth.signOut().catch(() => {});
    return;
  }

  const uid = authData.user.id;

  const { data: owned, error: ownedErr } = await supabase
    .from("restaurantes")
    .select("slug")
    .eq("owner_id", uid)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ownedErr) {
    await supabase.auth.signOut().catch(() => {});
    throw new Error(
      `[e2e pré-flight] Erro ao ler restaurantes (RLS ou schema): ${ownedErr.message}. Verifique migrações e ${README}.`,
    );
  }

  if (owned?.slug) {
    if (slugEnv && owned.slug !== slugEnv) {
      await supabase.auth.signOut().catch(() => {});
      throw new Error(
        `[e2e pré-flight] E2E_RESTAURANT_SLUG=${slugEnv} não coincide com o restaurante do utilizador (${owned.slug}). ` +
          `Corrija o env ou remova E2E_RESTAURANT_SLUG. Ver ${README}.`,
      );
    }
    await supabase.auth.signOut().catch(() => {});
    return;
  }

  if (slugEnv) {
    const { data: matchSlug, error: slugErr } = await supabase
      .from("restaurantes")
      .select("slug")
      .eq("slug", slugEnv)
      .eq("owner_id", uid)
      .maybeSingle();

    await supabase.auth.signOut().catch(() => {});

    if (slugErr) {
      throw new Error(`[e2e pré-flight] ${slugErr.message}. Ver ${README}.`);
    }
    if (matchSlug?.slug) return;

    throw new Error(
      `[e2e pré-flight] Não há linha em restaurantes com owner_id = utilizador de E2E_EMAIL e slug = ${slugEnv}. ` +
        `O slug na URL não substitui o vínculo owner: atualize owner_id no SQL ou use o slug do próprio dono. Ver ${README}.`,
    );
  }

  await supabase.auth.signOut().catch(() => {});

  throw new Error(
    `[e2e pré-flight] A conta ${email} não tem nenhum restaurante com owner_id = ao UUID deste user no Supabase. ` +
      `Os testes de /admin falham com «Assinatura pendente». Associe um tenant (SQL no README) ou defina ` +
      `E2E_RESTAURANT_SLUG apenas depois de owner_id estar correto para esse slug. ` +
      `UUID desta sessão (cole no update/insert do README): ${uid}. ` +
      `Documentação: ${README}. Para saltar esta verificação: E2E_SKIP_RESTAURANT_CHECK=1.`,
  );
}
