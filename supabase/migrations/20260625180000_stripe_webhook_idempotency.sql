-- Idempotência de webhooks Stripe (evita provisionar assinatura 2x em retry de rede).

create table if not exists public.stripe_processed_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);

comment on table public.stripe_processed_events is
  'IDs de eventos Stripe já processados (webhook idempotente).';

alter table public.stripe_processed_events enable row level security;
