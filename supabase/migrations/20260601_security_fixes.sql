-- =============================================================================
-- Security fixes (2026-06-01)
-- - Billing: remove client-side INSERT/UPDATE on assinaturas (service_role only).
-- - Remove permissive dev RLS on restaurantes / pratos / pedidos.
-- Apply via Supabase CLI or SQL Editor after review.
-- =============================================================================

-- --- assinaturas: mutations only via service_role (webhooks / server) ---
drop policy if exists "Usuários inserem a própria assinatura" on public.assinaturas;
drop policy if exists "Usuários atualizam a própria assinatura" on public.assinaturas;

-- --- drop dev / open-write policies (init-completo / schema.sql legacy) ---
drop policy if exists "restaurantes_dev_write_anon" on public.restaurantes;
drop policy if exists "pratos_dev_write_anon" on public.pratos;
drop policy if exists "pedidos_dev_all_anon_authenticated" on public.pedidos;

-- -----------------------------------------------------------------------------
-- Substituição: dono do tenant pode gerir pratos e pedidos (painel admin).
-- Leitura pública continua nas policies existentes (ex.: pratos_select_dev).
-- -----------------------------------------------------------------------------
drop policy if exists "owners_insert_pratos" on public.pratos;
create policy "owners_insert_pratos"
  on public.pratos
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.restaurantes r
      where r.id = pratos.restaurante_id
        and r.owner_id = auth.uid()
    )
  );

drop policy if exists "owners_update_pratos" on public.pratos;
create policy "owners_update_pratos"
  on public.pratos
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.restaurantes r
      where r.id = pratos.restaurante_id
        and r.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.restaurantes r
      where r.id = pratos.restaurante_id
        and r.owner_id = auth.uid()
    )
  );

drop policy if exists "owners_delete_pratos" on public.pratos;
create policy "owners_delete_pratos"
  on public.pratos
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.restaurantes r
      where r.id = pratos.restaurante_id
        and r.owner_id = auth.uid()
    )
  );

drop policy if exists "owners_select_pedidos" on public.pedidos;
create policy "owners_select_pedidos"
  on public.pedidos
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.restaurantes r
      where r.id = pedidos.restaurante_id
        and r.owner_id = auth.uid()
    )
  );

drop policy if exists "owners_update_pedidos" on public.pedidos;
create policy "owners_update_pedidos"
  on public.pedidos
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.restaurantes r
      where r.id = pedidos.restaurante_id
        and r.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.restaurantes r
      where r.id = pedidos.restaurante_id
        and r.owner_id = auth.uid()
    )
  );

drop policy if exists "owners_delete_pedidos" on public.pedidos;
create policy "owners_delete_pedidos"
  on public.pedidos
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.restaurantes r
      where r.id = pedidos.restaurante_id
        and r.owner_id = auth.uid()
    )
  );
