# Maturidade SaaS — meu-cardapio

Documento de referência para comparar o projeto com um checklist genérico de SaaS.  
**Legenda:** Sim | Parcial | Não — com nota curta quando útil.

**Última revisão:** baseada no estado do repositório (código + SQL em `supabase/`).

---

## Produto e go-to-market

| Item | Status | Evidência / nota |
|------|--------|------------------|
| Proposta de valor e ICP | Parcial | Vertical clara (cardápio + WhatsApp); ICP não documentado formalmente. |
| Onboarding guiado | Não | Cadastro/login/checkout existem; fluxo “primeiro sucesso” não é um wizard dedicado. |
| Marketing + SEO | Parcial | Landing em `app/(marketing)/`; SEO/metadata básicos em `app/layout.tsx`. |
| Páginas legais (termos, privacidade, cookies) | Não | Não há rotas ou copy legal no app (além do que o Supabase/Stripe cobrem nos seus fluxos). |
| Trial / freemium explícito | Parcial | Stripe permite `trialing`; gate em `proxy.ts` aceita `active` e `trialing`; política comercial não está no repo. |
| Changelog / releases | Não | Não versionado no produto. |

## Identidade, acesso e multitenant

| Item | Status | Evidência / nota |
|------|--------|------------------|
| Cadastro, login, recuperação, e-mail | Parcial | Supabase Auth; docs em `lib/auth/supabase-confirm-email.md`, E2E em `tests/e2e/`. |
| SSO / SAML enterprise | Não | Fora do escopo atual. |
| Multi-usuário por tenant (convites, papéis) | Não | Modelo **1 utilizador = dono** (`owner_id` em `restaurantes`); sem RBAC de equipe. |
| Isolamento tenant em todas as camadas | Parcial | **Produção recomendada:** políticas por `owner_id` em `supabase/init-completo.sql` e migrações (`owners_*`). O `supabase/schema.sql` raiz ainda descreve políticas **amplas para dev** — risco se alguém aplicar só esse ficheiro. |
| Proteção de `/admin` | Sim | `proxy.ts`: sessão obrigatória + assinatura ativa/trial em `assinaturas`. |

## Billing e finanças

| Item | Status | Evidência / nota |
|------|--------|------------------|
| Planos e checkout | Sim | `lib/plans.ts`, `app/api/checkout/create-session`, Stripe. |
| Webhooks idempotentes | Parcial | Tratamento dedicado em `lib/stripe/*`; depende de configuração e testes de carga de webhooks. |
| Upgrade/downgrade self-service | Parcial | Checkout de assinatura; portal do cliente Stripe não evidenciado no front. |
| Impostos / NF-e Brasil | Não | Não integrado no app (avaliação fiscal fica fora). |
| Enforcement de limite de plano (pedidos/mês) | Não | Limite Essencial (150) está em copy em `lib/plans.ts`; **sem contagem/enforcement no servidor** (`grep` não encontra uso além de features de marketing). |
| Gating de feature Premium (ex.: Kanban) | Parcial | Diferença de produto descrita nos planos; **não há verificação óbvia de `plan`/`price` no código de admin** para desativar Kanban no Essencial. |

## Segurança e privacidade

| Item | Status | Evidência / nota |
|------|--------|------------------|
| Segredos só no servidor | Sim | Orientação em `.env.example` (`NEXT_PUBLIC_*` vs service role / Stripe). |
| RLS alinhada a produção | Parcial | **Sim** se deploy usar `init-completo.sql` + migrações de segurança (`20260601_security_fixes.sql`, etc.). **Não** se base for só `schema.sql` permissivo. |
| Rate limiting em APIs públicas | Não | Sem `rateLimit` / throttle no código. |
| LGPD (bases legais, DPA, exclusão/exportação) | Não | Não documentado nem automatizado no app. |
| Auditoria de ações admin | Parcial | Logs estruturados e access log em APIs (`lib/logging/*`, `run-api-with-access-log`); sem trilha de auditoria de produto dedicada. |

## Confiabilidade e performance

| Item | Status | Evidência / nota |
|------|--------|------------------|
| Retries / timeouts DB | Parcial | `proxy.ts` (assinaturas), `lib/supabase/query-timeouts.ts`, `with-retry` no admin. |
| Backups / DR | Não | Responsabilidade da plataforma (Supabase/Vercel); não documentado no repo. |
| Jobs/filas assíncronas | Não | Fluxo síncrono Next + Supabase. |
| CDN / cache vitrine | Parcial | Next/Vercel por defeito; política de cache por rota não detalhada aqui. |
| Status page / runbooks | Não | — |

## Dados e analytics

| Item | Status | Evidência / nota |
|------|--------|------------------|
| Eventos de vitrine | Parcial | `POST /api/analytics` + migração opcional `vitrine_analytics_events` (`.env.example`). |
| BI interno (MRR, churn) | Não | Dados de billing no Stripe; não há dashboard interno no app. |

## Suporte e operações

| Item | Status | Evidência / nota |
|------|--------|------------------|
| Help center / tickets | Não | Copy de “suporte prioritário” no plano Premium apenas. |
| Ferramentas internas (impersonation) | Não | — |

## Engenharia e qualidade

| Item | Status | Evidência / nota |
|------|--------|------------------|
| CI | Parcial | `.github/workflows/e2e.yml`: Latin-1 gate + Playwright. **Não** corre `npm run verify` (tsc + lint + build) no workflow atual. |
| Testes E2E | Sim | Playwright + `tests/e2e/README.md`. |
| Ambientes / feature flags | Não | Variáveis por ambiente; sem sistema de flags. |
| Migrations versionadas | Sim | `supabase/migrations/*.sql` + `init-completo.sql`. |

## Integrações

| Item | Status | Evidência / nota |
|------|--------|------------------|
| WhatsApp (pedido) | Sim | Montagem de links/mensagens (`lib/restaurante/whatsapp-href.ts`, etc.). |
| APIs públicas documentadas | Parcial | Rotas `app/api/*` sem OpenAPI publicada. |
| ERP / marketplaces | Não | — |

---

## Cinco gaps prioritários (roadmap sugerido)

1. **Consistência de segurança em DB (RLS)**  
   Garantir que **produção** aplica sempre `init-completo.sql` + migrações (owner-based), e desencorajar ou remover o caminho `schema.sql` “dev aberto” da documentação de deploy, para não haver dois verdades.

2. **Abuso e custo: rate limiting**  
   Proteger `POST /api/pedidos/vitrine`, `POST /api/analytics` e endpoints públicos contra flood (edge middleware, Vercel Firewall, ou Supabase + proxy).

3. **Billing = contrato no código**  
   Implementar no servidor: (a) **teto mensal de pedidos** no Essencial, (b) **gating** de Kanban (e outras features Premium) com base em `assinaturas` + `price`/metadata Stripe, não só na UI.

4. **Compliance e confiança B2B**  
   Páginas mínimas: Termos, Privacidade/LGPD, cookies; link no footer do marketing e no cadastro.

5. **CI mais forte**  
   Acrescentar job que execute `npm run verify` (ou pelo menos `tsc --noEmit` + `eslint` + `next build`) em PR/push, para alinhar com o que developers correm localmente.

---

## Comparar com outro SaaS

Duplique a tabela, mantenha os mesmos itens e preencha a segunda coluna “Concorrente X”. Itens com maior diferença (ex.: **Não** vs **Sim**) costumam ser diferenciação comercial ou dívida técnica.
