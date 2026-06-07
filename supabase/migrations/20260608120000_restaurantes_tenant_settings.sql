-- Configurações editáveis pelo dono no painel + RLS de UPDATE em restaurantes
-- (a policy dev_write foi removida em 20260601_security_fixes.sql).

alter table public.restaurantes
  add column if not exists horario_funcionamento text null;

alter table public.restaurantes
  add column if not exists taxa_entrega numeric(10, 2) null;

alter table public.restaurantes
  drop constraint if exists restaurantes_taxa_entrega_nonneg;

alter table public.restaurantes
  add constraint restaurantes_taxa_entrega_nonneg
  check (taxa_entrega is null or taxa_entrega >= 0);

comment on column public.restaurantes.horario_funcionamento is
  'Texto livre exibido na vitrine (ex.: Ter–Dom 11h–23h).';
comment on column public.restaurantes.taxa_entrega is
  'Taxa fixa de entrega em reais (opcional); somada ao total no pedido via WhatsApp.';

drop policy if exists "owners_update_own_restaurante" on public.restaurantes;
create policy "owners_update_own_restaurante"
  on public.restaurantes
  for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
