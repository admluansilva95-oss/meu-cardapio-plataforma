# Testes E2E (Playwright)

## Stack

- **Next.js** (App Router), **Supabase Auth** no cliente, proteção de `/admin` no `proxy.ts` (middleware).

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

## Variáveis (integração — obrigatórias para 16/16 testes)

O `tests/e2e/global-setup.ts` carrega **`.env.local`** e **`.env.e2e`** (sem sobrescrever variáveis já definidas no shell/CI).

| Variável | Uso |
|----------|-----|
| `E2E_EMAIL` | Conta Supabase do projeto |
| `E2E_PASSWORD` | Palavra-passe |
| `E2E_RESTAURANT_SLUG` | Opcional: `?slug=` no `/admin` |

Modelo: copiar `.env.e2e.example` → `.env.e2e` e preencher.

No **GitHub Actions**, as mesmas chaves vêm de *secrets* (ver `.github/workflows/e2e.yml`).

## E-mails (confirmação / recuperação)

- Envio pelo **Supabase Auth**; `email-auth-trigger.spec.ts` valida o `POST` a `/auth/v1/signup`.
- Ver `EMAIL_AND_AUTH.md`.
