# E-mail de confirmação (Supabase) — evitar PKCE entre dispositivos

O fluxo com `?code=` e `exchangeCodeForSession` exige o **code verifier** no mesmo navegador em que o cadastro foi iniciado. Abrir o link no celular ou em aba anónima costuma gerar *PKCE code verifier not found*.

## Template “Confirm signup” (Dashboard → Authentication → Email Templates)

O `signUp` deste projeto envia `emailRedirectTo` construído por `buildEmailAuthRedirectTo()` em `lib/auth/auth-callback-url.ts` — sempre **`https://SEU_DOMINIO/auth/callback?next=`** + `next` (caminho interno codificado, ex.: `/assinar?ob=…`).

No template HTML do e-mail, use **`token_hash`** (não use só `{{ .ConfirmationURL }}` se quiser suporte entre dispositivos), por exemplo:

```html
<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup&next={{ .RedirectTo }}">Confirmar cadastro</a>
```

- `{{ .RedirectTo }}` deve corresponder ao `emailRedirectTo` enviado no `signUp` (URL permitida em **Redirect URLs**).
- Se o editor do Supabase quebrar o `href` por causa de `&` na URL, mantenha **uma única** URL de redirect no projeto ou siga a documentação oficial do Supabase para escapar variáveis no template.

### Tutorial com `/auth/confirm`

O dashboard do Supabase por vezes sugere links do tipo **`/auth/confirm?token_hash=…`**. Este projeto expõe **`GET /auth/confirm`** em `app/auth/confirm/route.ts`, que redireciona para **`/auth/callback`** com a mesma query string, para não devolver JSON do tipo `requested path is invalid` por caminho inexistente.

Em **Authentication → URL Configuration**:

- **Site URL** deve ser a origem do site em produção (a mesma ideia que `NEXT_PUBLIC_APP_URL` / `getPublicAppUrl()`).
- Em **Redirect URLs**, inclua pelo menos:
  - `https://SEU_DOMINIO/auth/callback`
  - `https://SEU_DOMINIO/auth/confirm` (se usar o template ou links com `/auth/confirm`)
  - Em desenvolvimento: `http://localhost:3000/auth/callback` e `http://localhost:3000/auth/confirm`

Depois de salvar, o handler em `app/auth/callback/route.ts` chama `verifyOtp` ou `exchangeCodeForSession` e grava a sessão nos cookies com `@supabase/ssr`.
