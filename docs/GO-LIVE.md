# Go-live — Meu Cardápio

Checklist para colocar a plataforma em operação com clientes reais.  
**Não altera o que já funciona** — complementa deploy, segurança e compliance.

---

## 1. Vercel

- [ ] Projeto ligado ao repositório `meu-cardapio-plataforma`, branch `main`
- [ ] Variáveis de ambiente (Production):

| Variável | Obrigatória |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Sim |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sim |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim |
| `STRIPE_SECRET_KEY` | Sim |
| `STRIPE_WEBHOOK_SECRET` | Sim |
| `NEXT_PUBLIC_STRIPE_PRICE_ESSENCIAL` | Sim (Price ID real do Stripe) |
| `NEXT_PUBLIC_STRIPE_PRICE_PREMIUM` | Sim |
| `NEXT_PUBLIC_APP_URL` | Sim (`https://meu-cardapio-plataforma.vercel.app` ou domínio próprio) |

- [ ] Deploy verde após push (`npm run build` passa localmente)
- [ ] `/` abre a **landing** (não login)
- [ ] `/login` e `/admin` funcionam

---

## 2. Supabase

- [ ] **Produção:** executar `supabase/init-completo.sql` e depois **todas** as migrações em `supabase/migrations/` (ordem por data no nome do arquivo)
- [ ] **Não** usar só `schema.sql` da raiz em produção (políticas de dev)
- [ ] Authentication → URL Configuration:
  - Site URL = URL pública do app
  - Redirect URLs incluem `/auth/callback`, `/auth/confirm`
- [ ] E-mail de confirmação de cadastro testado
- [ ] RLS: dono só acessa o próprio restaurante (`owner_id`)

---

## 3. Stripe

- [ ] Produtos/preços Essencial e Premium criados (valores alinhados a `lib/plans.ts`)
- [ ] Webhook apontando para `https://SEU_DOMINIO/api/webhooks/stripe`
- [ ] Eventos mínimos: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`
- [ ] Teste de checkout real ou modo teste até validar fluxo completo

---

## 4. Regras de plano (servidor)

Implementado em `lib/billing/restaurante-plan.ts`:

- **Limite Essencial (150 pedidos/mês):** aplicado em `POST /api/pedidos/vitrine` quando o `price_id` da assinatura está mapeado em `lib/plans.ts`
- **Sem `price_id` ou plano desconhecido:** não bloqueia (clientes legados continuam normais)
- **Kanban:** não bloqueado no painel (evita quebrar quem já usa); diferenciação comercial permanece nos planos

---

## 5. Proteção de APIs públicas

Rate limit leve (por IP, por instância):

| Rota | Limite |
|------|--------|
| `POST /api/pedidos/vitrine` | 30/min |
| `POST /api/analytics` | 120/min |
| `GET /api/public/cardapio` | 90/min por slug |

Uso normal de restaurante **não** é afetado.

---

## 6. Legal

- [ ] `/termos` e `/privacidade` publicados
- [ ] Links no footer da landing e no cadastro
- [ ] Revisar textos com assessoria jurídica antes de campanha em massa

---

## 7. Smoke test pós-deploy

1. Abrir `/` → landing  
2. `/assinar?plan=essencial` → checkout Stripe  
3. Cadastro + confirmação de e-mail  
4. `/admin` → painel com slug do restaurante  
5. Cardápio público `/{slug}` → pedido teste  
6. Pedido aparece na esteira  
7. Impressão térmica no Chrome (opcional)  
8. GitHub Actions: job `verify` + E2E verdes  

---

## 8. Suporte operacional

- Monitorar deploys na Vercel (build logs)
- Monitorar webhooks no Stripe (entregas com falha)
- Logs estruturados nas APIs (`requestId` nas respostas JSON)

---

**Última atualização:** junho de 2026.
