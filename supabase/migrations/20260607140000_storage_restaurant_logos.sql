-- Bucket público para logos dos restaurantes (painel Marca e vitrine → vitrine pública).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'restaurant-logos',
  'restaurant-logos',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "restaurant_logos_public_read" on storage.objects;
create policy "restaurant_logos_public_read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'restaurant-logos');

drop policy if exists "restaurant_logos_authenticated_insert" on storage.objects;
create policy "restaurant_logos_authenticated_insert"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'restaurant-logos');

drop policy if exists "restaurant_logos_authenticated_update" on storage.objects;
create policy "restaurant_logos_authenticated_update"
  on storage.objects for update to anon, authenticated
  using (bucket_id = 'restaurant-logos');

drop policy if exists "restaurant_logos_authenticated_delete" on storage.objects;
create policy "restaurant_logos_authenticated_delete"
  on storage.objects for delete to anon, authenticated
  using (bucket_id = 'restaurant-logos');

comment on column public.restaurantes.logo is 'URL pública no Storage (bucket restaurant-logos) ou CDN.';
