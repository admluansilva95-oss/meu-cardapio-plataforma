-- Garante colunas da vitrine (idempotente) — corrige "column restaurantes.vitrine_fechada does not exist"
-- se migrações anteriores ainda não foram aplicadas no projeto Supabase.

alter table public.restaurantes
  add column if not exists vitrine_fechada boolean not null default false;

alter table public.restaurantes
  add column if not exists mensagem_fechado text null;

comment on column public.restaurantes.vitrine_fechada is
  'Se true, a vitrine mostra aviso de fechado e bloqueia novos itens no carrinho.';
comment on column public.restaurantes.mensagem_fechado is
  'Texto opcional no aviso (ex.: feriado); se null, a vitrine usa mensagem padrão.';
