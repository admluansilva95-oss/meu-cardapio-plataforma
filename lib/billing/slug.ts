const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Normaliza texto para slug URL (ex.: "Restaurante do Luan" → "restaurante-do-luan"). */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function isValidSlug(slug: string): boolean {
  const s = slug.trim();
  return s.length >= 3 && s.length <= 64 && SLUG_PATTERN.test(s);
}

export function normalizeSlugInput(raw: string): string {
  return slugify(raw);
}
