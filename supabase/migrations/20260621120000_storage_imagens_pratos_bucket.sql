-- Bucket público para fotos dos pratos (painel Cardápio → upload).
-- Corrige "Bucket not found" / 404 se o projeto só tiver `restaurant-logos` ou nenhum bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'imagens-pratos',
  'imagens-pratos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "imagens_pratos_public_read" on storage.objects;
create policy "imagens_pratos_public_read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'imagens-pratos');

drop policy if exists "imagens_pratos_authenticated_upload" on storage.objects;
create policy "imagens_pratos_authenticated_upload"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'imagens-pratos');

drop policy if exists "imagens_pratos_authenticated_update" on storage.objects;
create policy "imagens_pratos_authenticated_update"
  on storage.objects for update to anon, authenticated
  using (bucket_id = 'imagens-pratos');

drop policy if exists "imagens_pratos_authenticated_delete" on storage.objects;
create policy "imagens_pratos_authenticated_delete"
  on storage.objects for delete to anon, authenticated
  using (bucket_id = 'imagens-pratos');
