-- =============================================================================
-- PATCH RÁPIDO — colunas que faltam em bases já criadas
-- Rode isto se aparecer: column "owner_id" does not exist
-- =============================================================================

-- restaurantes
alter table public.restaurantes
  add column if not exists owner_id uuid references auth.users (id) on delete cascade;

alter table public.restaurantes
  add column if not exists logo text null;

create index if not exists idx_restaurantes_owner_id on public.restaurantes (owner_id);

comment on column public.restaurantes.owner_id is
  'Dono (Supabase Auth). Preenchido no webhook checkout.session.completed.';

-- assinaturas (cria tabela se ainda não existir)
create table if not exists public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  restaurante_id uuid null references public.restaurantes (id) on delete set null,
  stripe_customer_id text null,
  stripe_subscription_id text null,
  status text not null default 'incomplete',
  price_id text null,
  created_at timestamptz not null default now(),
  constraint assinaturas_status_check check (
    status in (
      'incomplete', 'incomplete_expired', 'trialing', 'active',
      'past_due', 'canceled', 'unpaid', 'paused'
    )
  )
);

alter table public.assinaturas
  add column if not exists restaurante_id uuid references public.restaurantes (id) on delete set null;

create index if not exists idx_assinaturas_user_id on public.assinaturas (user_id);
create index if not exists idx_assinaturas_restaurante_id on public.assinaturas (restaurante_id);

create unique index if not exists idx_assinaturas_stripe_subscription_id
  on public.assinaturas (stripe_subscription_id)
  where stripe_subscription_id is not null;

alter table public.assinaturas enable row level security;

drop policy if exists "owners_select_own_restaurante" on public.restaurantes;
create policy "owners_select_own_restaurante"
  on public.restaurantes for select to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "Usuários leem a própria assinatura" on public.assinaturas;
create policy "Usuários leem a própria assinatura"
  on public.assinaturas for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Usuários inserem a própria assinatura" on public.assinaturas;
create policy "Usuários inserem a própria assinatura"
  on public.assinaturas for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Usuários atualizam a própria assinatura" on public.assinaturas;
create policy "Usuários atualizam a própria assinatura"
  on public.assinaturas for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
