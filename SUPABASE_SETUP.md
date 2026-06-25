# APP BRATAN - Supabase setup

## 1. Criar projeto

Crie um projeto Supabase e copie:

- Project URL
- anon public key

Depois crie `.env.local` a partir de `.env.example`:

```bash
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_ANON_KEY
```

## 2. Aplicar migrations

No SQL Editor do Supabase, rode nesta ordem:

1. `supabase/migrations/202606240001_foundation.sql`
2. `supabase/migrations/202606240002_phase_1_modules.sql`
3. `supabase/migrations/202606240003_access_pops_comprovantes.sql`
4. `supabase/migrations/202606240004_audit_and_access_admin.sql`
5. `supabase/migrations/202606240005_pagamento_lembretes.sql`

Essas migrations criam:

- cargos e colaboradores
- funções RLS `has_cargo`, `is_coordenacao`, `can_comprovantes`
- checklist da Fase 1 com template inicial
- mural
- comprovantes
- bucket privado `comprovantes`
- POPs & Fluxos preparado
- auditoria operacional
- lembretes de pagamento para coordenação

## 3. Criar sua conta

Em `Authentication > Users`, crie seu usuário com e-mail e senha.

Depois rode:

```sql
supabase/bootstrap/definir-minha-conta-como-coordenacao.sql
```

Antes de rodar, troque:

```sql
meu_email text := 'SEU_EMAIL_AQUI@institutobratan.com.br';
```

pelo seu e-mail real.

Isso vincula sua conta ao cargo `gestor_financeiro`, que faz parte da coordenação.

## 4. Publicar criação de acessos

Para que a tela `Colaboradores` consiga criar login e senha para a equipe, publique a Edge Function:

```bash
supabase secrets set SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY
supabase functions deploy create-colaborador-access
```

A `service_role_key` deve ficar somente nos secrets do Supabase. Não coloque essa chave no `.env.local`.

## 5. Login

Com `.env.local` configurado, o app deixa de depender da prévia local e entra com e-mail/senha.

Na coordenação você terá acesso a:

- Tarefas do dia
- Almoço
- Mural leitura/publicação
- POPs & Fluxos
- Comprovantes
- Colaboradores

## 6. Próxima etapa

O app já está preparado para o envio futuro dos comprovantes ao SharePoint via Microsoft Graph API. Nesta fase, o arquivo fica no Supabase Storage privado e o status permanece como `pendente`.
