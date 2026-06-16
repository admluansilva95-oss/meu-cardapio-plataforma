# Instruções — copiar mudanças para o projeto na nuvem

Use esta lista **na ordem**. Se na nuvem você só tem **um arquivo** aberto, identifique qual é (ex.: `page.tsx`) e vá direto à secção correspondente.

---

## 0. Antes de tudo (Supabase + Vercel)

### SQL no Supabase (bases **já** criadas antes da coluna “Entregue”)

1. Abra **Supabase → SQL Editor**.
2. Cole e execute o conteúdo do ficheiro **`supabase/migrations/20260527120000_pedidos_coluna_entregue.sql`** (está no final deste documento, secção **Anexo A**).

### Variável opcional na Vercel

- **`NEXT_PUBLIC_ADMIN_RESTAURANT_SLUG`** — só se quiser abrir `/admin` sem `?slug=` (valor = slug do restaurante padrão).

---

## 1. Ficheiros **NOVOS** (criar pastas se não existirem)

Copie **tal qual** cada bloco para o caminho indicado.

### `lib/tenantDisplay.ts`

```ts
/**
 * Nome exibido quando o cadastro ainda não tem `nome` preenchido no banco.
 * Ex.: slug `meu-bistrô` → "Meu Bistrô"
 */
export function formatSlugToDisplayName(slug: string): string {
  const s = slug.trim();
  if (!s) return "Restaurante";
  return s
    .split(/[-_]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

export function resolveRestauranteDisplayNome(nome: string | null | undefined, slug: string): string {
  const t = nome?.trim();
  if (t) return t;
  return formatSlugToDisplayName(slug);
}
```

### `lib/supabaseServer.ts`

```ts
import { createClient } from "@supabase/supabase-js";

/** Cliente somente leitura pública para metadados e rotas server (anon key). */
export function createPublicSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY são obrigatórios.");
  }
  return createClient(url, key);
}
```

### `app/[slug]/layout.tsx`

```tsx
import type { Metadata } from "next";
import { createPublicSupabaseServerClient } from "@/lib/supabaseServer";
import { formatSlugToDisplayName, resolveRestauranteDisplayNome } from "@/lib/tenantDisplay";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params;
  if (!slug?.trim()) {
    return { title: "Cardápio" };
  }

  let displayName = formatSlugToDisplayName(slug);
  try {
    const supabase = createPublicSupabaseServerClient();
    const { data } = await supabase.from("restaurantes").select("nome").eq("slug", slug).maybeSingle();
    if (data && typeof data.nome === "string") {
      displayName = resolveRestauranteDisplayNome(data.nome, slug);
    }
  } catch {
    /* rede / env: mantém fallback pelo slug */
  }

  const title = `${displayName} · Cardápio`;
  return {
    title,
    description: `Cardápio digital de ${displayName}. Peça pelo WhatsApp.`,
    openGraph: { title, description: `Cardápio digital de ${displayName}.` },
  };
}

export default async function SlugLayout({ children, params }: LayoutProps) {
  await params;
  return children;
}
```

### `supabase/migrations/20260527120000_pedidos_coluna_entregue.sql`

Ver **Anexo A** no fim deste ficheiro.

---

## 2. Ficheiros **GRANDES** alterados (recomendado: copiar o ficheiro inteiro)

A forma mais segura na nuvem é **substituir o ficheiro completo** pelo que tens na tua máquina na pasta do projeto (mesmos caminhos):

| Caminho | O que mudou (resumo) |
|--------|----------------------|
| `app/[slug]/page.tsx` | Import `tenantDisplay`; `mapRestauranteRow` com nome resolvido; `document.title` com fallback pelo slug; botão **+** no prato; sacola flutuante **só com itens** (mono); CTA WhatsApp **verde**; sem FAB vazio. |
| `app/admin/page.tsx` | Sem slug fixo; `Suspense` + `useSearchParams`; `?slug=` ou env; Kanban **4 colunas** (entregue); `AdminMissingSlugView`; `resolveRestauranteDisplayNome`; grid 4 colunas; subtítulo com `restaurante.slug`. |
| `app/page.tsx` | Campo opcional slug; redirect para `/admin?slug=...`; texto do login sem “demo”. |
| `app/login/page.tsx` | Igual ao `app/page.tsx` para slug + redirect. |
| `schema.sql` | `pedidos.coluna` com `'entregue'`; comentários; **removidos** inserts de exemplo; comentário slug neutro. |
| `supabase/schema.sql` | Igual ao `schema.sql` na parte de `pedidos` e seed. |

Comando local para validar antes de subir:

```bash
npx tsc --noEmit && npm run build
```

---

## 3. Se tiveres de **fundir à mão** (sem copiar o ficheiro inteiro)

### `app/[slug]/page.tsx`

1. Import: `import { resolveRestauranteDisplayNome, formatSlugToDisplayName } from "@/lib/tenantDisplay";`
2. Em `mapRestauranteRow`, use `nome: resolveRestauranteDisplayNome(row.nome, row.slug)`.
3. `useEffect` do `document.title`: se não houver `restaurante`, usar `formatSlugToDisplayName(slug)`.
4. Trocar o bloco fixo inferior do carrinho por: **um único** botão escuro **só quando** `cartCount > 0`, com ícone + texto mono (itens + total).
5. Link WhatsApp no drawer: classes verdes (`bg-[#22c55e]` / hover `#16a34a`), **sem** `style={{ backgroundColor: accent }}`.
6. Botão de adicionar: círculo escuro com **"+"** e `aria-label` com o nome do prato.

### `app/admin/page.tsx`

1. Remover qualquer `const TENANT_SLUG = "..."`.
2. Imports: `Suspense`, `useSearchParams`, `resolveRestauranteDisplayNome` de `@/lib/tenantDisplay`.
3. `KanbanCol` incluir `"entregue"`; `isKanbanCol`, `nextColuna`, `mensagemParaColuna`, `porColuna` e array `colunas` com 4 etapas (títulos: Pendente, Preparando, Pronto, Entregue).
4. `mapRestauranteRow`: `nome: resolveRestauranteDisplayNome(row.nome, row.slug)`.
5. `tenantSlug` = `searchParams.get("slug")` ou `process.env.NEXT_PUBLIC_ADMIN_RESTAURANT_SLUG`.
6. `loadData`: se `!tenantSlug`, limpar e sair; senão `.eq("slug", tenantSlug)`.
7. Componente `AdminMissingSlugView` + early return se `!tenantSlug`.
8. `export default` com `<Suspense fallback={...}><AdminPageInner /></Suspense>`.
9. Grid Kanban: `grid-cols-1 md:grid-cols-2 xl:grid-cols-4`.

### `schema.sql` / `supabase/schema.sql`

- Na tabela `pedidos`, constraint de `coluna` deve aceitar: `'recebidos', 'cozinha', 'pronto', 'entregue'`.
- Apagar bloco de `insert` de restaurante/pratos de exemplo (se ainda existir).

---

## 4. Depois de colar tudo na nuvem

1. `npm install` (se faltar `@supabase/supabase-js`, já costuma vir com o projeto).
2. `npx tsc --noEmit`
3. `npm run build`
4. Commit / push conforme o teu fluxo.

---

## Anexo A — migration SQL (copiar para Supabase ou para o ficheiro de migration)

```sql
-- Amplia a esteira Kanban para incluir etapa "entregue" (Entregue).
-- Rode no SQL Editor se o projeto já existia antes desta alteração.

alter table public.pedidos drop constraint if exists pedidos_coluna_check;

alter table public.pedidos
  add constraint pedidos_coluna_check
  check (coluna in ('recebidos', 'cozinha', 'pronto', 'entregue'));

comment on column public.pedidos.coluna is 'Coluna da esteira Kanban: recebidos (pendente), cozinha (preparando), pronto ou entregue.';
```

Se o `DROP CONSTRAINT` falhar (nome diferente no Postgres), no SQL Editor executa:

```sql
select conname from pg_constraint
where conrelid = 'public.pedidos'::regclass and contype = 'c';
```

e substitui `pedidos_coluna_check` pelo nome que aparecer.

---

## Uso do admin na nuvem

Abre sempre:

`/admin?slug=o-slug-do-restaurante-no-supabase`

Gratidão — qualquer ficheiro que não encontres na nuvem, cria o caminho igual ao da tabela da secção 2.
