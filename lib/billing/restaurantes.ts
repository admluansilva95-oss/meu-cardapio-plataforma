import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidSlug, normalizeSlugInput } from "@/lib/billing/slug";

export type ProvisionRestauranteInput = {
  user_id: string;
  slug: string;
  restaurant_name?: string | null;
  whatsapp?: string | null;
};

/**
 * Cria o tenant em `restaurantes` após pagamento confirmado (webhook Stripe).
 * Idempotente: se o owner já tiver restaurante com o mesmo slug, atualiza assinatura link.
 */
export async function provisionRestauranteAfterPayment(
  admin: SupabaseClient,
  input: ProvisionRestauranteInput
): Promise<{ ok: true; restaurante_id: string; slug: string } | { ok: false; error: string }> {
  const slug = normalizeSlugInput(input.slug);
  if (!isValidSlug(slug)) {
    return { ok: false, error: "Slug inválido nos metadados do checkout." };
  }

  const nome = input.restaurant_name?.trim() || slug;
  const whatsapp = input.whatsapp?.trim() || "+5500000000000";

  const { data: existingByOwner, error: ownerErr } = await admin
    .from("restaurantes")
    .select("id, slug")
    .eq("owner_id", input.user_id)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ownerErr) {
    console.error("[billing/restaurantes] select by owner:", ownerErr.message);
    return { ok: false, error: ownerErr.message };
  }

  if (existingByOwner) {
    return { ok: true, restaurante_id: existingByOwner.id, slug: existingByOwner.slug };
  }

  const { data: slugTaken, error: slugErr } = await admin
    .from("restaurantes")
    .select("id, owner_id")
    .eq("slug", slug)
    .maybeSingle();

  if (slugErr) {
    console.error("[billing/restaurantes] select by slug:", slugErr.message);
    return { ok: false, error: slugErr.message };
  }

  if (slugTaken && slugTaken.owner_id !== input.user_id) {
    return { ok: false, error: `O slug "${slug}" já está em uso.` };
  }

  if (slugTaken) {
    return { ok: true, restaurante_id: slugTaken.id, slug };
  }

  const { data: inserted, error: insertErr } = await admin
    .from("restaurantes")
    .insert({
      nome,
      slug,
      whatsapp,
      cor_tema: "#0d9488",
      owner_id: input.user_id,
    })
    .select("id, slug")
    .single();

  if (insertErr) {
    console.error("[billing/restaurantes] insert:", insertErr.message);
    return { ok: false, error: insertErr.message };
  }

  return { ok: true, restaurante_id: inserted.id, slug: inserted.slug };
}

export async function isSlugAvailable(
  admin: SupabaseClient,
  slug: string,
  excludeUserId?: string
): Promise<boolean> {
  const normalized = normalizeSlugInput(slug);
  if (!isValidSlug(normalized)) return false;

  const { data, error } = await admin
    .from("restaurantes")
    .select("id, owner_id")
    .eq("slug", normalized)
    .maybeSingle();

  if (error) {
    console.error("[billing/restaurantes] isSlugAvailable:", error.message);
    return false;
  }

  if (!data) return true;
  if (excludeUserId && data.owner_id === excludeUserId) return true;
  return false;
}

export async function findRestauranteSlugByOwnerId(
  admin: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data, error } = await admin
    .from("restaurantes")
    .select("slug")
    .eq("owner_id", userId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[billing/restaurantes] find slug by owner:", error.message);
    return null;
  }

  return data?.slug ?? null;
}
