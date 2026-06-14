# meu-cardapio

## Documentação

- [Checklist de maturidade SaaS (comparativo)](docs/SAAS-MATURIDADE.md)

## Produção: ligar o site ao Supabase (Auth e API)

No painel do teu hosting (ex.: **Vercel** → Project → Settings → Environment Variables), define **pelo menos**:

| Variável | Onde obter o valor |
| -------- | ------------------- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → **Project Settings** → **API** → *Project URL* (ex.: `https://xxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Mesmo ecrã → *anon public* |

Estas variáveis entram no **build** do Next.js; depois de as adicionares ou alterares, faz um **novo deploy** (rebuild). Sem elas, o login e o resto da app que falam com o Supabase não têm para onde ligar — vês mensagens como a de `lib/auth/supabase-browser-auth-safe.ts` (“credenciais públicas… no painel de deploy”).

Copia local: ficheiro `.env.example` na raiz. Para funcionalidades só de servidor (pedidos na vitrine, webhooks, etc.) vê também `SUPABASE_SERVICE_ROLE_KEY` no mesmo `.env.example`.

## Supabase Storage (evitar “Bucket not found” / 404)

O painel envia fotos para dois buckets **públicos** com estes nomes exatos:

| Bucket             | Uso              |
| ------------------ | ---------------- |
| `imagens-pratos`   | Fotos dos pratos |
| `restaurant-logos` | Logo do tenant   |

Se aparecer **404** ou **Bucket not found**, no Supabase abra **SQL Editor** e rode, nesta ordem:

1. `supabase/migrations/20260607140000_storage_restaurant_logos.sql`
2. `supabase/migrations/20260621120000_storage_imagens_pratos_bucket.sql`

Alternativa: executar só a seção **STORAGE** de `supabase/init-completo.sql` (cria os dois buckets e as policies em `storage.objects`).

## Banco: erro `column restaurantes.horario_funcionamento does not exist`

O app grava um resumo de horário nessa coluna. Se o Postgres ainda não tiver o campo, no **SQL Editor** do Supabase rode **uma** destas opções (são idempotentes):

- Arquivo: `supabase/migrations/20260622120000_ensure_restaurantes_horario_funcionamento.sql`, ou
- Trecho equivalente em `supabase/init-completo.sql` (bloco `alter table public.restaurantes` com `horario_funcionamento`).

Se você usa **Supabase CLI** com migrations versionadas: `supabase db push` (ou aplique as pastas `supabase/migrations/` na ordem dos timestamps).