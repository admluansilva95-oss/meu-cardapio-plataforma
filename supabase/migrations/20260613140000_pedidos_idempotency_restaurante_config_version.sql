-- Idempotência de pedidos (vitrine): retries / duplo clique não duplicam linha.
-- Optimistic lock de configurações do restaurante (painel).

alter table public.pedidos
  add column if not exists idempotency_key text null;

comment on column public.pedidos.idempotency_key is
  'Chave opcional (header Idempotency-Key ou campo no JSON) por restaurante; evita pedido duplicado.';

create unique index if not exists idx_pedidos_restaurante_idempotency_key
  on public.pedidos (restaurante_id, idempotency_key)
  where idempotency_key is not null;

alter table public.restaurantes
  add column if not exists config_version bigint not null default 0;

comment on column public.restaurantes.config_version is
  'Contador de gravações de configuração (optimistic locking no painel).';
