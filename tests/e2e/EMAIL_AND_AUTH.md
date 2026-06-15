# E-mail e autenticação (E2E / QA)

## Onde os e-mails são disparados

| Fluxo | Código | Transporte |
|--------|--------|--------------|
| Confirmação de conta | `app/cadastro/cadastro-form.tsx` → `supabase.auth.signUp()` | **Supabase Auth (GoTrue)** envia o e-mail de confirmação |
| “Recuperar senha” | *Não há botão na UI atual* (`app/login/page.tsx`) | Se existir no futuro, seria `supabase.auth.resetPasswordForEmail()` → mesmo GoTrue |

A aplicação Next.js **não** envia SMTP próprio para estes fluxos.

## Secrets no GitHub Actions (Playwright)

O workflow `.github/workflows/e2e.yml` precisa destes **Repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Uso |
|--------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase (mesmo valor que em produção / staging de testes). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave **anon** pública (Settings → API no Supabase). |
| `E2E_EMAIL`, `E2E_PASSWORD` | **Obrigatórios** no CI para login, `/admin` e logout (ver `tests/e2e/fixtures/env.ts` e `global-setup.ts`). |
| `E2E_RESTAURANT_SLUG` | Opcional: `?slug=…` na URL do admin. Só é válido se existir `restaurantes` com esse `slug` e `owner_id` = utilizador de `E2E_EMAIL`. Sem linha própria, a UI mostra **"Assinatura pendente"** — ver **Dados no Supabase** em `tests/e2e/README.md`. O `global-setup` faz pré-flight e falha cedo se faltar tenant. |

Em local, o Playwright carrega **na ordem** `.env.local`, `.env.e2e` na raiz e `tests/e2e/.env.e2e`: cada chave fica com o **primeiro** valor encontrado (os ficheiros seguintes não sobrescrevem), **exceto** `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`: após o merge, estes dois valores são **sempre** tomados dos ficheiros (primeiro não vazio por chave) e aplicados ao `process.env` do Node, para vencer exports antigos no shell — o Next dá precedência a `process.env` já definido sobre o `.env.local` no disco, e o `webServer` repete esse ambiente no `next dev` filho. Coloque `NEXT_PUBLIC_SUPABASE_*` no mesmo sítio que `E2E_*`, senão o login nos E2E pode mostrar “ligado ao servidor de autenticação”. Se usar `npm run dev` noutro terminal com `reuseExistingServer`, reinicie esse servidor depois de alterar variáveis.

Sem `NEXT_PUBLIC_*`, o `next dev` no CI não alimenta o bundle e o login/cardápio quebram antes dos mocks.

Em **desenvolvimento local** (quando `VERCEL` não é `1`), o `next.config.mjs` funde `.env.e2e`, `tests/e2e/.env.e2e` e, em seguida, **força** `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` a partir do mesmo trio de ficheiros que o Playwright (`.env.local` primeiro por chave), para o inlining no cliente não depender da ordem em que o Next carrega `.env.local` em relação à avaliação da config.

## Como testar o gatilho sem caixa de entrada real

1. **`tests/e2e/email-auth-trigger.spec.ts`** — `page.route('**/auth/v1/signup**', …)` intercepta o `POST`, lê `postDataJSON().email` e devolve resposta mock. Valida que o cliente montou o pedido correto.
2. **Recuperação de senha** — Quando implementarem `resetPasswordForEmail`, repetir o padrão com `**/auth/v1/recover**` (ou o path exato da versão do GoTrue em uso) e assert sobre o corpo JSON (`email`, `redirect_to`, etc.).

## Como validar o conteúdo do e-mail (manual ou integração)

- **Supabase Dashboard** → Authentication → Users / logs de e-mail (conforme plano).
- **Self-hosted**: [Mailpit](https://mailpit.axllent.org/), [Inbucket](https://www.inbucket.org/) ou SMTP de desenvolvimento apontado no projeto Supabase.
- Desativar “Confirm email” no Auth (apenas ambientes de teste) para E2E totalmente automático com utilizador real.

Ver também `lib/auth/supabase-confirm-email.md` (se existir no repo).
