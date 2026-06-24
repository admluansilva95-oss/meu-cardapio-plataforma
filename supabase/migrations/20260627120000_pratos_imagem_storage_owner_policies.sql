-- Garante coluna de foto no cardápio + bucket público com upload só pelo dono do restaurante.

alter table public.pratos add column if not exists imagem text null;
comment on column public.pratos.imagem is 'URL pública no Storage (bucket imagens-pratos).';

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
drop policy if exists "imagens_pratos_owner_insert" on storage.objects;
create policy "imagens_pratos_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'imagens-pratos'
    and exists (
      select 1
      from public.restaurantes r
      where r.id::text = (storage.foldername(name))[1]
        and r.owner_id = auth.uid()
    )
  );

drop policy if exists "imagens_pratos_authenticated_update" on storage.objects;
drop policy if exists "imagens_pratos_owner_update" on storage.objects;
create policy "imagens_pratos_owner_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'imagens-pratos'
    and exists (
      select 1
      from public.restaurantes r
      where r.id::text = (storage.foldername(name))[1]
        and r.owner_id = auth.uid()
    )
  );

drop policy if exists "imagens_pratos_authenticated_delete" on storage.objects;
drop policy if exists "imagens_pratos_owner_delete" on storage.objects;
create policy "imagens_pratos_owner_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'imagens-pratos'
    and exists (
      select 1
      from public.restaurantes r
      where r.id::text = (storage.foldername(name))[1]
        and r.owner_id = auth.uid()
    )
  );
