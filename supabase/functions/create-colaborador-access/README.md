# create-colaborador-access

Edge Function para a coordenação criar o primeiro acesso de um colaborador.

Ela usa o token do usuário logado para confirmar `is_coordenacao(auth.uid())` e só depois usa a `SERVICE_ROLE_KEY` no ambiente seguro do Supabase.

## Deploy

```bash
supabase secrets set SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY
supabase functions deploy create-colaborador-access
```

Nunca coloque a service role key no `.env.local` do app.
