-- =============================================================================
-- assinaturas — billing multi-tenant (Stripe + Supabase Auth)
-- Rode no SQL Editor do Supabase (Database → SQL Editor).
-- =============================================================================

create table if not exists public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stripe_customer_id text null,
  stripe_subscription_id text null,
  status text not null default 'incomplete',
  price_id text null,
  created_at timestamptz not null default now(),
  constraint assinaturas_status_check check (
    status in (
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'paused'
    )
  )
);

create index if not exists idx_assinaturas_user_id on public.assinaturas (user_id);
create unique index if not exists idx_assinaturas_stripe_subscription_id
  on public.assinaturas (stripe_subscription_id)
  where stripe_subscription_id is not null;

comment on table public.assinaturas is 'Assinatura SaaS por usuário (1:N permitido durante migrações; prefira 1 ativa).';
comment on column public.assinaturas.status is 'Espelha status Stripe: active, canceled, past_due, etc.';

alter table public.assinaturas enable row level security;

create policy "Usuários leem a própria assinatura"
  on public.assinaturas
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Usuários inserem a própria assinatura"
  on public.assinaturas
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Usuários atualizam a própria assinatura"
  on public.assinaturas
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
