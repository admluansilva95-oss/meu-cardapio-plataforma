-- Textos opcionais para retirada no balcão (painel admin → sub-aba Retirada).

alter table public.restaurantes
  add column if not exists retirada_endereco_balcao text null;

alter table public.restaurantes
  add column if not exists retirada_preparo_estimado text null;

comment on column public.restaurantes.retirada_endereco_balcao is
  'Endereço exibido ao cliente para retirada no balcão (opcional).';
comment on column public.restaurantes.retirada_preparo_estimado is
  'Tempo estimado de preparo para retirada (texto livre, ex.: 20-30 minutos).';
