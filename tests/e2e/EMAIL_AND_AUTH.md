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
| `E2E_EMAIL`, `E2E_PASSWORD`, `E2E_RESTAURANT_SLUG` | Opcionais: só para testes de integração “login real” e `/admin` (ver `tests/e2e/fixtures/env.ts`). |

Sem `NEXT_PUBLIC_*`, o `next dev` no CI não alimenta o bundle e o login/cardápio quebram antes dos mocks.

## Como testar o gatilho sem caixa de entrada real

1. **`tests/e2e/email-auth-trigger.spec.ts`** — `page.route('**/auth/v1/signup**', …)` intercepta o `POST`, lê `postDataJSON().email` e devolve resposta mock. Valida que o cliente montou o pedido correto.
2. **Recuperação de senha** — Quando implementarem `resetPasswordForEmail`, repetir o padrão com `**/auth/v1/recover**` (ou o path exato da versão do GoTrue em uso) e assert sobre o corpo JSON (`email`, `redirect_to`, etc.).

## Como validar o conteúdo do e-mail (manual ou integração)

- **Supabase Dashboard** → Authentication → Users / logs de e-mail (conforme plano).
- **Self-hosted**: [Mailpit](https://mailpit.axllent.org/), [Inbucket](https://www.inbucket.org/) ou SMTP de desenvolvimento apontado no projeto Supabase.
- Desativar “Confirm email” no Auth (apenas ambientes de teste) para E2E totalmente automático com utilizador real.

Ver também `lib/auth/supabase-confirm-email.md` (se existir no repo).
