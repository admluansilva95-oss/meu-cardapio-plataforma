-- Entrega (modo fixa vs zonas), retirada no balcão e ordem de categorias do cardápio.

alter table public.restaurantes
  add column if not exists retirada_balcao boolean not null default false;

alter table public.restaurantes
  add column if not exists entrega_modo text;

update public.restaurantes
set entrega_modo = 'fixa'
where entrega_modo is null;

alter table public.restaurantes
  alter column entrega_modo set default 'fixa';

alter table public.restaurantes
  alter column entrega_modo set not null;

alter table public.restaurantes
  drop constraint if exists restaurantes_entrega_modo_check;

alter table public.restaurantes
  add constraint restaurantes_entrega_modo_check
  check (entrega_modo in ('fixa', 'zonas'));

alter table public.restaurantes
  add column if not exists cardapio_categorias jsonb;

update public.restaurantes
set cardapio_categorias = '[]'::jsonb
where cardapio_categorias is null;

alter table public.restaurantes
  alter column cardapio_categorias set default '[]'::jsonb;

alter table public.restaurantes
  alter column cardapio_categorias set not null;

comment on column public.restaurantes.retirada_balcao is 'Se o cliente pode optar por retirada no balcão (sem taxa de entrega).';
comment on column public.restaurantes.entrega_modo is 'fixa = taxa única (taxa_entrega); zonas = taxas_entrega_zonas.';
comment on column public.restaurantes.cardapio_categorias is 'Lista ordenada de nomes de seção (JSON array de strings).';
