-- =============================================================================
-- meu-cardapio — schema inicial (Supabase / PostgreSQL)
-- Rode este script no SQL Editor do painel Supabase (Database → SQL Editor).
-- =============================================================================

-- Extensões úteis (gen_random_uuid já existe no Postgres 13+; pgcrypto opcional)
-- create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- restaurantes
-- -----------------------------------------------------------------------------
create table if not exists public.restaurantes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  whatsapp text not null,
  -- URL pública do logo (Storage ou CDN); alinhado ao tipo TypeScript `Restaurante`
  logo text null,
  cor_tema text not null default '#0d9488',
  criado_em timestamptz not null default now()
);

create index if not exists idx_restaurantes_slug on public.restaurantes (slug);

comment on table public.restaurantes is 'Tenant do cardápio (um registro por restaurante).';
comment on column public.restaurantes.slug is 'Identificador único na URL (ex.: casa-do-sabor).';

alter table public.restaurantes
  add column if not exists horario_funcionamento text null;

comment on column public.restaurantes.horario_funcionamento is
  'Texto livre exibido na vitrine (ex.: Ter–Dom 11h–23h).';

alter table public.restaurantes
  add column if not exists taxa_entrega numeric(10, 2) null;

alter table public.restaurantes
  drop constraint if exists restaurantes_taxa_entrega_nonneg;

alter table public.restaurantes
  add constraint restaurantes_taxa_entrega_nonneg
  check (taxa_entrega is null or taxa_entrega >= 0);

comment on column public.restaurantes.taxa_entrega is
  'Taxa fixa de entrega em reais (opcional); vitrine pública e checkout de pedidos.';

-- -----------------------------------------------------------------------------
-- pratos
-- -----------------------------------------------------------------------------
create table if not exists public.pratos (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  nome text not null,
  preco numeric(10, 2) not null check (preco >= 0),
  descricao text null,
  imagem text null,
  status text not null default 'ativo' check (status in ('ativo', 'pausado')),
  criado_em timestamptz not null default now()
);

create index if not exists idx_pratos_restaurante on public.pratos (restaurante_id);
create index if not exists idx_pratos_status on public.pratos (status);
create index if not exists idx_pratos_restaurante_status_nome on public.pratos (restaurante_id, status, nome);

comment on table public.pratos is 'Itens do cardápio vinculados a um restaurante.';

alter table public.pratos add column if not exists imagem text null;
comment on column public.pratos.imagem is 'URL pública no Storage (bucket imagens-pratos).';

alter table public.pratos add column if not exists categoria text null;
comment on column public.pratos.categoria is 'Seção do cardápio na vitrine pública (ex.: Bebidas, Lanches).';

-- -----------------------------------------------------------------------------
-- pedidos (esteira / Kanban no admin)
-- -----------------------------------------------------------------------------
-- coluna: etapa da esteira (recebidos | cozinha | pronto)
-- itens: linhas do pedido em JSON, ex.: ["2x Bowl Mediterrâneo","1x Smoothie Verde"]
-- motoboy: usado no painel e nas mensagens de WhatsApp
create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  cliente text not null,
  telefone text not null,
  total numeric(10, 2) not null check (total >= 0),
  pagamento text not null check (pagamento in ('Pix', 'Cartão', 'Dinheiro')),
  coluna text not null default 'recebidos' check (coluna in ('recebidos', 'cozinha', 'pronto')),
  observacoes text not null default '',
  itens jsonb not null default '[]'::jsonb,
  motoboy text not null default '',
  criado_em timestamptz not null default now()
);

create index if not exists idx_pedidos_restaurante on public.pedidos (restaurante_id);
create index if not exists idx_pedidos_coluna on public.pedidos (coluna);
create index if not exists idx_pedidos_criado_em on public.pedidos (criado_em desc);

comment on table public.pedidos is 'Pedidos da cozinha / entrega, por restaurante.';
comment on column public.pedidos.coluna is 'Coluna da esteira Kanban: recebidos, cozinha ou pronto.';

-- -----------------------------------------------------------------------------
-- Row Level Security (RLS) — ajuste antes de produção
-- -----------------------------------------------------------------------------
-- Por padrão liberamos leitura pública do cardápio (restaurantes + pratos).
-- Pedidos: política permissiva para `anon` + `authenticated` APENAS para você
-- conseguir desenvolver o painel com a chave pública. Substitua por políticas
-- por tenant / JWT antes de ir ao ar com dados reais de clientes.

alter table public.restaurantes enable row level security;
alter table public.pratos enable row level security;
alter table public.pedidos enable row level security;

-- Leitura pública (vitrine): restaurantes
drop policy if exists "restaurantes_select_public" on public.restaurantes;
create policy "restaurantes_select_public"
  on public.restaurantes
  for select
  to anon, authenticated
  using (true);

-- Leitura de pratos (dev: todos os status; em produção restrinja vitrine a status = ativo)
drop policy if exists "pratos_select_public_ativos" on public.pratos;
drop policy if exists "pratos_select_dev" on public.pratos;
create policy "pratos_select_dev"
  on public.pratos
  for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- ATENÇÃO: política ampla em pedidos para desenvolvimento com ANON KEY.
-- Remova ou restrinja (ex.: auth.uid(), claim de restaurante_id) em produção.
-- ---------------------------------------------------------------------------
drop policy if exists "pedidos_dev_all_anon_authenticated" on public.pedidos;
create policy "pedidos_dev_all_anon_authenticated"
  on public.pedidos
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- Escrita em restaurantes/pratos com anon (APENAS desenvolvimento — restrinja em produção)
drop policy if exists "pratos_dev_write_anon" on public.pratos;
create policy "pratos_dev_write_anon"
  on public.pratos
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "restaurantes_dev_write_anon" on public.restaurantes;
create policy "restaurantes_dev_write_anon"
  on public.restaurantes
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- -----------------------------------------------------------------------------
-- Dados de exemplo (opcional — idempotente por slug / nome)
-- -----------------------------------------------------------------------------
insert into public.restaurantes (nome, slug, whatsapp, cor_tema)
select 'Casa do Sabor', 'casa-do-sabor', '+55 11 91234-5678', '#0d9488'
where not exists (select 1 from public.restaurantes where slug = 'casa-do-sabor');

insert into public.pratos (restaurante_id, nome, preco, descricao, status)
select r.id, 'Bowl Mediterrâneo', 32.90, 'Grão-de-bico, hummus, tomate confit e falafel.', 'ativo'
from public.restaurantes r
where r.slug = 'casa-do-sabor'
  and not exists (
    select 1 from public.pratos p where p.restaurante_id = r.id and p.nome = 'Bowl Mediterrâneo'
  );

insert into public.pratos (restaurante_id, nome, preco, descricao, status)
select r.id, 'Smoothie Verde', 18.00, 'Couve, abacate, limão e água de coco.', 'ativo'
from public.restaurantes r
where r.slug = 'casa-do-sabor'
  and not exists (
    select 1 from public.pratos p where p.restaurante_id = r.id and p.nome = 'Smoothie Verde'
  );
