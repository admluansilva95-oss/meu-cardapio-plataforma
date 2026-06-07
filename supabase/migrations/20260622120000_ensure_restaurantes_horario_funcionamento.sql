-- Garantia idempotente: bases criadas antes de 20260608120000 ou sem migrations aplicadas.
-- Corrige: "column restaurantes.horario_funcionamento does not exist"

alter table public.restaurantes
  add column if not exists horario_funcionamento text null;

comment on column public.restaurantes.horario_funcionamento is
  'Texto livre exibido na vitrine (ex.: Ter–Dom 11h–23h).';
