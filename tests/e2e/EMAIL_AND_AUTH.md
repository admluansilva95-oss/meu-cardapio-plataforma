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
| `E2E_RESTAURANT_SLUG` | Opcional: tenant em `/admin?slug=…`. |

Em local, o Playwright carrega **na ordem** `.env.local`, `.env.e2e` na raiz e `tests/e2e/.env.e2e`: cada chave fica com o **primeiro** valor encontrado (os ficheiros seguintes não sobrescrevem). Coloque `NEXT_PUBLIC_SUPABASE_*` no mesmo sítio que `E2E_*`, senão o `npm run dev` filho pode não enviar a chave anónima ao browser e o login mostra “ligado ao servidor de autenticação”. Se usar `npm run dev` noutro terminal com `reuseExistingServer`, reinicie esse servidor depois de alterar variáveis.

Sem `NEXT_PUBLIC_*`, o `next dev` no CI não alimenta o bundle e o login/cardápio quebram antes dos mocks.

Em **desenvolvimento local** (quando `VERCEL` não é `1`), o `next.config.mjs` funde `.env.e2e` e `tests/e2e/.env.e2e` em `process.env` — o Next por defeito não os lê, e **não** confiar em `NODE_ENV !== "production"` aqui: o Next pode avaliar a config com `NODE_ENV === "production"` mesmo em `next dev`, o que impedia o merge. Os valores passam também por `next.config.mjs` → `env` para inlining no cliente. Após alterar variáveis, reinicie o `next dev`.

## Como testar o gatilho sem caixa de entrada real

1. **`tests/e2e/email-auth-trigger.spec.ts`** — `page.route('**/auth/v1/signup**', …)` intercepta o `POST`, lê `postDataJSON().email` e devolve resposta mock. Valida que o cliente montou o pedido correto.
2. **Recuperação de senha** — Quando implementarem `resetPasswordForEmail`, repetir o padrão com `**/auth/v1/recover**` (ou o path exato da versão do GoTrue em uso) e assert sobre o corpo JSON (`email`, `redirect_to`, etc.).

## Como validar o conteúdo do e-mail (manual ou integração)

- **Supabase Dashboard** → Authentication → Users / logs de e-mail (conforme plano).
- **Self-hosted**: [Mailpit](https://mailpit.axllent.org/), [Inbucket](https://www.inbucket.org/) ou SMTP de desenvolvimento apontado no projeto Supabase.
- Desativar “Confirm email” no Auth (apenas ambientes de teste) para E2E totalmente automático com utilizador real.

Ver também `lib/auth/supabase-confirm-email.md` (se existir no repo).
