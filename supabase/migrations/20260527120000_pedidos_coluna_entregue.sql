-- Amplia a esteira Kanban para incluir etapa "entregue" (Entregue).
-- Rode no SQL Editor se o projeto já existia antes desta alteração.

alter table public.pedidos drop constraint if exists pedidos_coluna_check;

alter table public.pedidos
  add constraint pedidos_coluna_check
  check (coluna in ('recebidos', 'cozinha', 'pronto', 'entregue'));

comment on column public.pedidos.coluna is 'Coluna da esteira Kanban: recebidos (pendente), cozinha (preparando), pronto ou entregue.';
