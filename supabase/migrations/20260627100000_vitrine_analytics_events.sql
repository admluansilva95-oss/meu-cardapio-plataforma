-- Eventos leves de conversão da vitrine (ingestão via service_role em /api/analytics).
-- RLS ativo sem políticas públicas: apenas service_role grava/lê; anon/auth não têm acesso.

create table if not exists public.vitrine_analytics_events (
  id uuid primary key default gen_random_uuid(),
  event text not null check (char_length(event) <= 80),
  slug text null check (slug is null or char_length(slug) <= 200),
  prato_id uuid null,
  pedido_id uuid null,
  created_at timestamptz not null default now()
);

create index if not exists idx_vitrine_analytics_created
  on public.vitrine_analytics_events (created_at desc);

create index if not exists idx_vitrine_analytics_slug_created
  on public.vitrine_analytics_events (slug, created_at desc)
  where slug is not null;

comment on table public.vitrine_analytics_events is 'Métricas de funil da vitrine pública; populado pela API interna com service_role.';

alter table public.vitrine_analytics_events enable row level security;
