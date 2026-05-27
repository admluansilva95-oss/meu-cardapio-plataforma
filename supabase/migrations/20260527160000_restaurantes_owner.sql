-- Vincula restaurantes ao usuário Auth e assinaturas ao tenant (pós-pagamento Stripe).
-- IMPORTANTE: ALTER antes de índices/policies que referenciam a coluna.

alter table public.restaurantes
  add column if not exists owner_id uuid references auth.users (id) on delete cascade;

alter table public.restaurantes
  add column if not exists logo text null;

create index if not exists idx_restaurantes_owner_id on public.restaurantes (owner_id);

comment on column public.restaurantes.owner_id is 'Dono do tenant (Supabase Auth). Preenchido após checkout.session.completed.';

alter table public.assinaturas
  add column if not exists restaurante_id uuid references public.restaurantes (id) on delete set null;

create index if not exists idx_assinaturas_restaurante_id on public.assinaturas (restaurante_id);

drop policy if exists "owners_select_own_restaurante" on public.restaurantes;
create policy "owners_select_own_restaurante"
  on public.restaurantes
  for select
  to authenticated
  using (auth.uid() = owner_id);
