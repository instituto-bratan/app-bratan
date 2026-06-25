# GO LIVE - APP BRATAN

Projeto Supabase:

```txt
xdccpfdoxrjbzfdvoonr
https://xdccpfdoxrjbzfdvoonr.supabase.co
```

## 1. Completar o `.env.local`

O arquivo `.env.local` ja esta com a URL do projeto:

```bash
VITE_SUPABASE_URL=https://xdccpfdoxrjbzfdvoonr.supabase.co
VITE_SUPABASE_ANON_KEY=
```

No Supabase, va em `Project Settings > API` e copie a `anon public key`.
Cole no `VITE_SUPABASE_ANON_KEY`.

Nao use a `service_role` no `.env.local`.

## 2. Aplicar migrations

No Terminal, dentro de `app-bratan`, rode:

```bash
SUPABASE_TELEMETRY_DISABLED=1 supabase db push --linked
```

Se o CLI pedir senha do banco, use a senha do database do projeto Supabase.

Alternativa manual: no SQL Editor do Supabase, rode as migrations nesta ordem:

```txt
supabase/migrations/202606240001_foundation.sql
supabase/migrations/202606240002_phase_1_modules.sql
supabase/migrations/202606240003_access_pops_comprovantes.sql
supabase/migrations/202606240004_audit_and_access_admin.sql
supabase/migrations/202606240005_pagamento_lembretes.sql
```

## 3. Criar sua conta de coordenacao

No Supabase, va em `Authentication > Users` e crie seu usuario com e-mail e senha.

Depois abra:

```txt
supabase/bootstrap/definir-minha-conta-como-coordenacao.sql
```

Troque:

```sql
meu_email text := 'SEU_EMAIL_AQUI@institutobratan.com.br';
```

pelo e-mail real criado no Authentication, e rode no SQL Editor.

## 4. Conferir a Edge Function

Voce ja publicou:

```bash
supabase secrets set SERVICE_ROLE_KEY="..."
supabase functions deploy create-colaborador-access
```

Se precisar republicar:

```bash
SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy create-colaborador-access
```

## 5. Rodar o app real

Depois do `.env.local` completo:

```bash
npm run dev
```

Entre com o e-mail e senha criados no Supabase.
