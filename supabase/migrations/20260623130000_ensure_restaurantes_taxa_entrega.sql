-- Corrige: "column restaurantes.taxa_entrega does not exist"
-- Bases criadas só com schema antigo ou migrações fora de ordem.

alter table public.restaurantes
  add column if not exists taxa_entrega numeric(10, 2) null;

alter table public.restaurantes
  drop constraint if exists restaurantes_taxa_entrega_nonneg;

alter table public.restaurantes
  add constraint restaurantes_taxa_entrega_nonneg
  check (taxa_entrega is null or taxa_entrega >= 0);

comment on column public.restaurantes.taxa_entrega is
  'Taxa fixa de entrega em reais (opcional); somada ao total no pedido via WhatsApp.';
