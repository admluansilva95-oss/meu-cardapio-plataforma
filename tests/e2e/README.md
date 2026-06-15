# Testes E2E (Playwright)

## Stack

- **Next.js** (App Router), **Supabase Auth** no cliente, proteção de `/admin` em `proxy.ts` (no Next 16+ aparece como **Proxy (Middleware)** no output de `next build` — não usar um `middleware.ts` separado em paralelo).

## Estratégia de QA (resumo)

| Área | Abordagem |
|------|-----------|
| **Cadastro / validação** | `page.route` simula erros Supabase; formulário com `noValidate` e botão `type="button"` para submissão fiável. |
| **Login falho** | Mock de `POST …/auth/v1/token?grant_type=password` com 400. |
| **Login / admin / logout** | **Supabase real**: credenciais em `.env.local` ou `.env.e2e` (carregadas em `global-setup.ts`). Após login, navegação para `/admin?…&checkout=success` contorna a exigência de assinatura Stripe ativa (ver `proxy.ts`). |
| **Segurança** | Visitante acede `/admin` → redireciono para `/login?next=…`. |
| **E-mail** | Ver `EMAIL_AND_AUTH.md` e `email-auth-trigger.spec.ts`. |

Ficheiros principais: `auth.spec.ts`, `login.spec.ts`, `dashboard.spec.ts`, `security.spec.ts`, `email-auth-trigger.spec.ts`, `fixtures/*`.

## Comandos

```bash
npx playwright install chromium

npm run test:e2e

npm run test:e2e:ui

PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
```

## Variáveis (integração — obrigatórias para todos os testes com Supabase real)

O `tests/e2e/global-setup.ts` carrega **`.env.local`** e **`.env.e2e`** (sem sobrescrever variáveis já definidas no shell/CI).

| Variável | Uso |
|----------|-----|
| `E2E_EMAIL` | Conta Supabase do projeto |
| `E2E_PASSWORD` | Palavra-passe |
| `E2E_RESTAURANT_SLUG` | Opcional: `?slug=` no `/admin`; tem de ser um `restaurantes.slug` com `owner_id` = user de `E2E_EMAIL` (a mesma regra do pré-flight). |
| `E2E_SKIP_RESTAURANT_CHECK` | `1` — não corre o pré-flight no `global-setup` (login Supabase + query `restaurantes`). Útil se tiver `E2E_EMAIL` no ambiente mas só executar testes mock sem `/admin`. |

Com `E2E_EMAIL` e `NEXT_PUBLIC_SUPABASE_*` definidos, o **`global-setup`** faz login e verifica se existe tenant; falha **antes** dos browsers, com mensagem `[e2e pré-flight]`.

Modelo: copiar `.env.e2e.example` → `.env.e2e` e preencher.

No **GitHub Actions**, as mesmas chaves vêm de *secrets* (ver `.github/workflows/e2e.yml`).

### Dados no Supabase (obrigatório para login + `/admin`)

O painel resolve o tenant assim: sem `?slug=`, corre `select slug from restaurantes where owner_id = auth.uid() limit 1`. Se não houver linha, a UI mostra **«Assinatura pendente»** e os testes de integração falham (o pré-flight em `global-setup.ts` deve falhar primeiro com `[e2e pré-flight]`).

**Atalho — UUID sem abrir o dashboard:** no SQL Editor (role `postgres`), o mesmo UUID que o pré-flight espera em `owner_id`:

```sql
select id as owner_uuid, email
from auth.users
where lower(email) = lower('COLE_O_MESMO_EMAIL_QUE_E2E_EMAIL');
```

Use `owner_uuid` no `update` / `insert` abaixo. A mensagem `[e2e pré-flight] … UUID desta sessão: …` também mostra o UUID após login bem-sucedido.

**Opção A — associar um restaurante existente ao user de E2E** (SQL Editor no Supabase, como `postgres` / service role):

1. Obtenha o UUID do utilizador de `E2E_EMAIL` (atalho `select … from auth.users` acima ou **Authentication → Users**).
2. Execute (ajuste o slug ao que existir na tabela `restaurantes`):

```sql
update public.restaurantes
set owner_id = 'COLE_AQUI_O_UUID_DO_USER'::uuid
where slug = 'casa-do-sabor';
```

**Opção B — criar linha mínima** (se ainda não existir restaurante de teste; respeite colunas obrigatórias do teu schema, ex. `nome`, `slug`, `whatsapp`):

```sql
insert into public.restaurantes (nome, slug, whatsapp, owner_id)
values ('E2E', 'e2e-demo', '+5511999999999', 'COLE_AQUI_O_UUID_DO_USER'::uuid);
```

Depois podes definir `E2E_RESTAURANT_SLUG=e2e-demo` (opcional; sem isso o cliente redireciona sozinho após o `update`/`insert`).

Se o projeto usa apenas `supabase/schema.sql` antigo sem `owner_id`, aplica as migrações em `supabase/migrations/` ou `supabase/init-completo.sql` antes.

## E-mails (confirmação / recuperação)

- Envio pelo **Supabase Auth**; `email-auth-trigger.spec.ts` valida o `POST` a `/auth/v1/signup`.
- Ver `EMAIL_AND_AUTH.md`.
