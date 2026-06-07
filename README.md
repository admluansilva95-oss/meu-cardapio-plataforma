# meu-cardapio

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