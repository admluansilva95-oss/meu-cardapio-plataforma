# E-mail de confirmação (Supabase) — evitar PKCE entre dispositivos

O fluxo com `?code=` e `exchangeCodeForSession` exige o **code verifier** no mesmo navegador em que o cadastro foi iniciado. Abrir o link no celular ou em aba anônima costuma gerar *PKCE code verifier not found*.

## Template “Confirm signup” (Dashboard → Authentication → Email Templates)

O `signUp` deste projeto envia `emailRedirectTo` assim:

`https://SEU_DOMINIO/auth/callback?next=` + (`next` contém `/assinar?ob=…` com os dados do restaurante, codificado).

No template HTML do e-mail, use **`token_hash`** (não use só `{{ .ConfirmationURL }}` se quiser suporte entre dispositivos), por exemplo:

```html
<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup&next={{ .RedirectTo }}">Confirmar cadastro</a>
```

- `{{ .RedirectTo }}` deve corresponder ao `emailRedirectTo` enviado no `signUp` (URL permitida em **Redirect URLs**).
- Se o editor do Supabase quebrar o `href` por causa de `&` na URL, mantenha **uma única** URL de redirect no projeto ou siga a documentação oficial do Supabase para escapar variáveis no template.

Depois de salvar, o handler em `app/auth/callback/route.ts` chama `verifyOtp` e grava a sessão nos cookies com `@supabase/ssr`.
