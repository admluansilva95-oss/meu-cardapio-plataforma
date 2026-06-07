-- Horário semanal estruturado + taxas por zona (JSON). Mantém colunas legadas para compat.

alter table public.restaurantes
  add column if not exists funcionamento_semana jsonb null;

alter table public.restaurantes
  add column if not exists taxas_entrega_zonas jsonb null;

comment on column public.restaurantes.funcionamento_semana is
  'Agenda por dia da semana (ativo + faixas abertura/fechamento em HH:mm).';
comment on column public.restaurantes.taxas_entrega_zonas is
  'Lista de { id, nome, valor } para taxas por bairro/região.';
