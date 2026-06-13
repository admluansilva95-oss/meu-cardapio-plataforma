# Testes E2E (Playwright)

## Stack

- **Next.js** (App Router), **Supabase Auth** no cliente, proteção de `/admin` no `proxy.ts` (middleware).

## Estratégia de QA (resumo)

| Área | Abordagem |
|------|-----------|
| **Cadastro / validação** | Testes **sem credenciais**: `page.route` simula erros Supabase ou usa `noValidate` + remoção de `minLength` para forçar validações React (slug, e-mail, senha). |
| **Login falho** | Mock de `POST …/auth/v1/token?grant_type=password` com 400. |
| **Login / admin / logout** | `test.describe` com `test.skip` se faltarem `E2E_EMAIL`, `E2E_PASSWORD`, `E2E_RESTAURANT_SLUG` — integração real opcional em CI ou staging. |
| **Segurança** | Visitante acede `/admin` → espera redireciono para `/login?next=…`. |
| **E-mail** | Não há SMTP na app; ver `EMAIL_AND_AUTH.md` e `email-auth-trigger.spec.ts`. |

Ficheiros principais: `auth.spec.ts`, `login.spec.ts`, `dashboard.spec.ts`, `security.spec.ts`, `email-auth-trigger.spec.ts`.

## Comandos

```bash
# Instala browsers (uma vez por máquina)
npx playwright install chromium

# Sobe o dev server automaticamente e corre todos os testes
npm run test:e2e

# UI interativa
npm run test:e2e:ui

# Servidor já a correr noutro terminal
PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
```

## Variáveis opcionais (integração)

| Variável | Uso |
|----------|-----|
| `E2E_EMAIL` | Conta real no Supabase do projeto |
| `E2E_PASSWORD` | Palavra-passe da conta |
| `E2E_RESTAURANT_SLUG` | Slug do tenant (`/admin?slug=...`) |

Sem estas variáveis, os testes que exigem sessão são **ignorados** (`test.skip`).

## E-mails (confirmação / recuperação)

- O envio é feito pelo **Supabase Auth**, não pelo código Next.js.
- `tests/e2e/email-auth-trigger.spec.ts` confirma que o browser dispara `POST …/auth/v1/signup` com o JSON esperado (mock corta o fluxo a seguir).
- **Recuperação de senha:** não há UI de “esqueci a senha” no login atual; quando existir, interceptar `POST` ao endpoint de recover do GoTrue (ver `EMAIL_AND_AUTH.md`).
- Para validar conteúdo do e-mail: [Mailpit](https://mailpit.axllent.org/) ou [Inbucket](https://www.inbucket.org/) em self-host, ou **Authentication → Users →** no dashboard Supabase; em desenvolvimento, configure redirect URLs e desative confirmação de e-mail se precisar de fluxo totalmente automático.

Documentação interna: `lib/auth/supabase-confirm-email.md` (se existir), `EMAIL_AND_AUTH.md`.
