-- Espelho do plano Stripe no tenant (sincronizado via webhook de upgrade).
-- Resolve limites de pedidos sem depender só da ordem de leitura em `assinaturas`.

alter table public.restaurantes
  add column if not exists plano_id text null;

alter table public.restaurantes
  drop constraint if exists restaurantes_plano_id_check;

alter table public.restaurantes
  add constraint restaurantes_plano_id_check
  check (plano_id is null or plano_id in ('essencial', 'premium'));

comment on column public.restaurantes.plano_id is
  'Plano SaaS ativo (essencial|premium); atualizado por webhooks Stripe customer.subscription.updated e invoice.payment_succeeded.';

create index if not exists idx_assinaturas_stripe_customer_id
  on public.assinaturas (stripe_customer_id)
  where stripe_customer_id is not null;
