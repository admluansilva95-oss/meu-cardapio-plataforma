-- Colunas usadas por GET /api/public/cardapio (evita erros tipo "column … does not exist").
-- Idempotente: seguro rodar várias vezes no SQL Editor ou via `supabase db push`.

-- Vitrine fechada / aviso
alter table public.restaurantes
  add column if not exists vitrine_fechada boolean not null default false;

alter table public.restaurantes
  add column if not exists mensagem_fechado text null;

comment on column public.restaurantes.vitrine_fechada is
  'Se true, a vitrine mostra aviso de fechado e bloqueia novos itens no carrinho.';
comment on column public.restaurantes.mensagem_fechado is
  'Texto opcional no aviso (ex.: feriado); se null, a vitrine usa mensagem padrão.';

-- Horário e taxas (JSON)
alter table public.restaurantes
  add column if not exists funcionamento_semana jsonb null;

alter table public.restaurantes
  add column if not exists taxas_entrega_zonas jsonb null;

comment on column public.restaurantes.funcionamento_semana is
  'Agenda por dia da semana (ativo + faixas abertura/fechamento em HH:mm).';
comment on column public.restaurantes.taxas_entrega_zonas is
  'Lista de { id, nome, valor } para taxas por bairro/região.';

-- Entrega e categorias do cardápio
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

comment on column public.restaurantes.retirada_balcao is
  'Se o cliente pode optar por retirada no balcão (sem taxa de entrega).';
comment on column public.restaurantes.entrega_modo is
  'fixa = taxa única (taxa_entrega); zonas = taxas_entrega_zonas.';
comment on column public.restaurantes.cardapio_categorias is
  'Lista ordenada de nomes de seção (JSON array de strings).';

-- Textos da vitrine
alter table public.restaurantes
  add column if not exists mensagem_boas_vindas text null;

alter table public.restaurantes
  add column if not exists texto_vitrine_aberto text null;

alter table public.restaurantes
  add column if not exists texto_vitrine_fechado text null;

alter table public.restaurantes
  add column if not exists mensagem_fora_horario text null;

comment on column public.restaurantes.mensagem_boas_vindas is
  'Frase curta abaixo do status na vitrine pública (cardápio).';
comment on column public.restaurantes.texto_vitrine_aberto is
  'Linha ao lado do indicador “Aberto” quando o cardápio aceita pedidos.';
comment on column public.restaurantes.texto_vitrine_fechado is
  'Linha ao lado do indicador “Fechado” quando pedidos estão indisponíveis.';
comment on column public.restaurantes.mensagem_fora_horario is
  'Aviso opcional quando fora do horário (diferente da pausa manual / mensagem_fechado).';
