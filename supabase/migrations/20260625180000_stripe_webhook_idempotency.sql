-- Idempotência de webhooks Stripe (evita processar o mesmo event.id duas vezes).
-- Lookup principal: event_id (PK). processed_at para auditoria e jobs de retenção.

create table if not exists public.stripe_processed_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

comment on table public.stripe_processed_events is
  'Eventos Stripe já aceitos pelo webhook (idempotência por event_id).';

comment on column public.stripe_processed_events.event_id is
  'Stripe-Event-Id (evt_...) — chave primária.';

comment on column public.stripe_processed_events.processed_at is
  'Momento em que o evento foi reservado no webhook (default now()).';

-- Compat: primeira versão da migração usava `received_at`; renomeia se existir.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stripe_processed_events'
      and column_name = 'received_at'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stripe_processed_events'
      and column_name = 'processed_at'
  ) then
    alter table public.stripe_processed_events rename column received_at to processed_at;
  end if;
end $$;

-- Índice em processed_at: retenção / relatórios (a PK já cobre lookup por event_id).
create index if not exists idx_stripe_processed_events_processed_at
  on public.stripe_processed_events (processed_at desc);

alter table public.stripe_processed_events enable row level security;
