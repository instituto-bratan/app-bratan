# create-colaborador-access

Edge Function para a coordenação criar o primeiro acesso de um colaborador.

Ela usa o token do usuário logado para confirmar `is_coordenacao(auth.uid())` e só depois usa a `SERVICE_ROLE_KEY` no ambiente seguro do Supabase.

Regras atuais:
- aceita apenas e-mails `@institutobratan.com.br`;
- exige senha inicial com pelo menos 12 caracteres;
- restringe origem para `https://app-bratan.vercel.app`, `http://127.0.0.1:5173` e `http://localhost:5173`, salvo se `APP_ALLOWED_ORIGINS` for definido.

## Deploy

```bash
supabase secrets set SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY
supabase secrets set APP_ALLOWED_ORIGINS="https://app-bratan.vercel.app,http://127.0.0.1:5173,http://localhost:5173"
supabase functions deploy create-colaborador-access
```

Nunca coloque a service role key no `.env.local` do app.
