-- Vitrine pública: leitura anônima só de pratos ativos (GET /api/public/cardapio).
-- Dono autenticado continua vendo todos os status do próprio restaurante.

drop policy if exists "pratos_select_public_ativos" on public.pratos;
create policy "pratos_select_public_ativos"
  on public.pratos
  for select
  to anon
  using (status = 'ativo');

drop policy if exists "owners_select_own_pratos" on public.pratos;
create policy "owners_select_own_pratos"
  on public.pratos
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.restaurantes r
      where r.id = pratos.restaurante_id
        and r.owner_id = auth.uid()
    )
  );
