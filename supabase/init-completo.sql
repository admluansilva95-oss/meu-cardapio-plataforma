-- =============================================================================
-- meu-cardapio — SCHEMA COMPLETO (Supabase SQL Editor)
-- =============================================================================
-- Cole e execute este arquivo inteiro no SQL Editor (Database → SQL Editor).
--
-- O que este script cria:
--   • public.restaurantes   (tenant / cardápio; owner_id → auth.users)
--   • public.pratos         (itens do cardápio — no app não existe "produtos")
--   • public.pedidos        (esteira Kanban no admin)
--   • public.assinaturas    (billing Stripe; restaurante_id → restaurantes)
--
-- Usuários de login: tabela auth.users (Supabase Auth). Não há public.usuarios.
--
-- Pré-requisito: Authentication habilitado no projeto Supabase.
-- Idempotente: pode rodar mais de uma vez (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RESTAURANTES (tenant)
-- -----------------------------------------------------------------------------
create table if not exists public.restaurantes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  whatsapp text not null,
  cor_tema text not null default '#0d9488',
  criado_em timestamptz not null default now()
);

-- Bases antigas: CREATE IF NOT EXISTS não adiciona colunas novas — ALTER antes de índices/policies
alter table public.restaurantes
  add column if not exists owner_id uuid references auth.users (id) on delete cascade;

alter table public.restaurantes
  add column if not exists logo text null;

alter table public.restaurantes
  add column if not exists horario_funcionamento text null;

alter table public.restaurantes
  add column if not exists taxa_entrega numeric(10, 2) null;

alter table public.restaurantes
  drop constraint if exists restaurantes_taxa_entrega_nonneg;

alter table public.restaurantes
  add constraint restaurantes_taxa_entrega_nonneg
  check (taxa_entrega is null or taxa_entrega >= 0);

alter table public.restaurantes
  add column if not exists vitrine_fechada boolean not null default false;

alter table public.restaurantes
  add column if not exists mensagem_fechado text null;

alter table public.restaurantes
  add column if not exists funcionamento_semana jsonb null;

alter table public.restaurantes
  add column if not exists taxas_entrega_zonas jsonb null;

alter table public.restaurantes
  add column if not exists retirada_balcao boolean not null default false;

alter table public.restaurantes
  add column if not exists entrega_modo text not null default 'fixa';

alter table public.restaurantes
  add column if not exists cardapio_categorias jsonb not null default '[]'::jsonb;

alter table public.restaurantes
  drop constraint if exists restaurantes_entrega_modo_check;

alter table public.restaurantes
  add constraint restaurantes_entrega_modo_check
  check (entrega_modo in ('fixa', 'zonas'));

comment on table public.restaurantes is 'Tenant do cardápio (um registro por restaurante, após pagamento Stripe).';
comment on column public.restaurantes.slug is 'URL pública: /{slug} e /admin?slug={slug}';
comment on column public.restaurantes.owner_id is 'Dono (Supabase Auth). Preenchido no webhook checkout.session.completed.';

create index if not exists idx_restaurantes_slug on public.restaurantes (slug);
create index if not exists idx_restaurantes_owner_id on public.restaurantes (owner_id);

-- -----------------------------------------------------------------------------
-- 2. PRATOS (cardápio / “produtos” no domínio do app)
-- -----------------------------------------------------------------------------
create table if not exists public.pratos (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  nome text not null,
  preco numeric(10, 2) not null check (preco >= 0),
  descricao text null,
  imagem text null,
  categoria text null,
  status text not null default 'ativo' check (status in ('ativo', 'pausado')),
  criado_em timestamptz not null default now()
);

comment on table public.pratos is 'Itens do cardápio por restaurante.';
comment on column public.pratos.imagem is 'URL pública no Storage (bucket imagens-pratos).';
comment on column public.pratos.categoria is 'Agrupamento na vitrine (ex.: Bebidas).';

alter table public.pratos add column if not exists imagem text null;
alter table public.pratos add column if not exists categoria text null;

create index if not exists idx_pratos_restaurante on public.pratos (restaurante_id);
create index if not exists idx_pratos_status on public.pratos (status);

-- -----------------------------------------------------------------------------
-- 3. PEDIDOS (Kanban admin)
-- -----------------------------------------------------------------------------
create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  cliente text not null,
  telefone text not null,
  total numeric(10, 2) not null check (total >= 0),
  pagamento text not null check (pagamento in ('Pix', 'Cartão', 'Dinheiro')),
  coluna text not null default 'recebidos'
    check (coluna in ('recebidos', 'cozinha', 'pronto', 'entregue')),
  observacoes text not null default '',
  itens jsonb not null default '[]'::jsonb,
  motoboy text not null default '',
  criado_em timestamptz not null default now()
);

comment on table public.pedidos is 'Pedidos por restaurante (esteira no painel).';

create index if not exists idx_pedidos_restaurante on public.pedidos (restaurante_id);
create index if not exists idx_pedidos_coluna on public.pedidos (coluna);
create index if not exists idx_pedidos_criado_em on public.pedidos (criado_em desc);

-- Atualiza CHECK da coluna em tabelas criadas antes (sem "entregue")
alter table public.pedidos drop constraint if exists pedidos_coluna_check;
alter table public.pedidos
  add constraint pedidos_coluna_check
  check (coluna in ('recebidos', 'cozinha', 'pronto', 'entregue'));

-- -----------------------------------------------------------------------------
-- 4. ASSINATURAS (Stripe + Auth)
-- -----------------------------------------------------------------------------
create table if not exists public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stripe_customer_id text null,
  stripe_subscription_id text null,
  status text not null default 'incomplete',
  price_id text null,
  created_at timestamptz not null default now(),
  constraint assinaturas_status_check check (
    status in (
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'paused'
    )
  )
);

alter table public.assinaturas
  add column if not exists restaurante_id uuid references public.restaurantes (id) on delete set null;

comment on table public.assinaturas is 'Assinatura SaaS por usuário; restaurante_id após checkout pago.';
comment on column public.assinaturas.status is 'Espelha status Stripe (active, canceled, etc.).';

create index if not exists idx_assinaturas_user_id on public.assinaturas (user_id);
create index if not exists idx_assinaturas_restaurante_id on public.assinaturas (restaurante_id);

create unique index if not exists idx_assinaturas_stripe_subscription_id
  on public.assinaturas (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- -----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------
alter table public.restaurantes enable row level security;
alter table public.pratos enable row level security;
alter table public.pedidos enable row level security;
alter table public.assinaturas enable row level security;

-- --- restaurantes ---
drop policy if exists "restaurantes_select_public" on public.restaurantes;
create policy "restaurantes_select_public"
  on public.restaurantes for select to anon, authenticated
  using (true);

drop policy if exists "owners_select_own_restaurante" on public.restaurantes;
create policy "owners_select_own_restaurante"
  on public.restaurantes for select to authenticated
  using (auth.uid() = owner_id);

-- DEV: escrita ampla — restrinja em produção (apenas owner ou service role)
drop policy if exists "restaurantes_dev_write_anon" on public.restaurantes;
create policy "restaurantes_dev_write_anon"
  on public.restaurantes for all to anon, authenticated
  using (true) with check (true);

-- --- pratos ---
drop policy if exists "pratos_select_public_ativos" on public.pratos;
drop policy if exists "pratos_select_dev" on public.pratos;
create policy "pratos_select_dev"
  on public.pratos for select to anon, authenticated
  using (true);

drop policy if exists "pratos_dev_write_anon" on public.pratos;
create policy "pratos_dev_write_anon"
  on public.pratos for all to anon, authenticated
  using (true) with check (true);

-- --- pedidos ---
drop policy if exists "pedidos_dev_all_anon_authenticated" on public.pedidos;
create policy "pedidos_dev_all_anon_authenticated"
  on public.pedidos for all to anon, authenticated
  using (true) with check (true);

-- --- assinaturas (cliente autenticado; webhook usa service_role e ignora RLS) ---
drop policy if exists "Usuários leem a própria assinatura" on public.assinaturas;
create policy "Usuários leem a própria assinatura"
  on public.assinaturas for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Usuários inserem a própria assinatura" on public.assinaturas;
create policy "Usuários inserem a própria assinatura"
  on public.assinaturas for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Usuários atualizam a própria assinatura" on public.assinaturas;
create policy "Usuários atualizam a própria assinatura"
  on public.assinaturas for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 6. STORAGE — bucket de imagens dos pratos
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'imagens-pratos',
  'imagens-pratos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "imagens_pratos_public_read" on storage.objects;
create policy "imagens_pratos_public_read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'imagens-pratos');

drop policy if exists "imagens_pratos_authenticated_upload" on storage.objects;
create policy "imagens_pratos_authenticated_upload"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'imagens-pratos');

drop policy if exists "imagens_pratos_authenticated_update" on storage.objects;
create policy "imagens_pratos_authenticated_update"
  on storage.objects for update to anon, authenticated
  using (bucket_id = 'imagens-pratos');

drop policy if exists "imagens_pratos_authenticated_delete" on storage.objects;
create policy "imagens_pratos_authenticated_delete"
  on storage.objects for delete to anon, authenticated
  using (bucket_id = 'imagens-pratos');

-- -----------------------------------------------------------------------------
-- 6b. STORAGE — logos dos restaurantes
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'restaurant-logos',
  'restaurant-logos',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "restaurant_logos_public_read" on storage.objects;
create policy "restaurant_logos_public_read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'restaurant-logos');

drop policy if exists "restaurant_logos_authenticated_insert" on storage.objects;
create policy "restaurant_logos_authenticated_insert"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'restaurant-logos');

drop policy if exists "restaurant_logos_authenticated_update" on storage.objects;
create policy "restaurant_logos_authenticated_update"
  on storage.objects for update to anon, authenticated
  using (bucket_id = 'restaurant-logos');

drop policy if exists "restaurant_logos_authenticated_delete" on storage.objects;
create policy "restaurant_logos_authenticated_delete"
  on storage.objects for delete to anon, authenticated
  using (bucket_id = 'restaurant-logos');

-- -----------------------------------------------------------------------------
-- 7. DADOS DE EXEMPLO (opcional — demo sem owner_id / sem assinatura)
-- -----------------------------------------------------------------------------
insert into public.restaurantes (nome, slug, whatsapp, cor_tema)
select 'Casa do Sabor', 'casa-do-sabor', '+55 11 91234-5678', '#0d9488'
where not exists (select 1 from public.restaurantes where slug = 'casa-do-sabor');

insert into public.pratos (restaurante_id, nome, preco, descricao, status, categoria)
select r.id, 'Bowl Mediterrâneo', 32.90, 'Grão-de-bico, hummus, tomate confit e falafel.', 'ativo', 'Pratos'
from public.restaurantes r
where r.slug = 'casa-do-sabor'
  and not exists (
    select 1 from public.pratos p
    where p.restaurante_id = r.id and p.nome = 'Bowl Mediterrâneo'
  );

insert into public.pratos (restaurante_id, nome, preco, descricao, status, categoria)
select r.id, 'Smoothie Verde', 18.00, 'Couve, abacate, limão e água de coco.', 'ativo', 'Bebidas'
from public.restaurantes r
where r.slug = 'casa-do-sabor'
  and not exists (
    select 1 from public.pratos p
    where p.restaurante_id = r.id and p.nome = 'Smoothie Verde'
  );

-- =============================================================================
-- Fim. Verifique no Table Editor: restaurantes, pratos, pedidos, assinaturas.
-- =============================================================================
