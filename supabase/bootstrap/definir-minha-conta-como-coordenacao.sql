-- 1) Crie sua conta em Authentication > Users no Supabase com e-mail/senha.
-- 2) Troque o e-mail abaixo pelo seu e-mail real.
-- 3) Rode este SQL no SQL Editor para vincular sua conta ao cargo gestor_financeiro.

do $$
declare
  minha_conta uuid;
  meu_email text := 'SEU_EMAIL_AQUI@institutobratan.com.br';
  meu_colaborador uuid := '00000000-0000-0000-0000-000000000004';
begin
  select id
  into minha_conta
  from auth.users
  where email = meu_email
  limit 1;

  if minha_conta is null then
    raise exception 'Conta não encontrada em auth.users para o e-mail %', meu_email;
  end if;

  update public.colaborador
  set auth_id = minha_conta,
      nome = coalesce(nullif(nome, '[Gestor Financeiro]'), nome),
      email = meu_email,
      ativo = true
  where id = meu_colaborador;

  update public.colaborador_cargo
  set auth_id = minha_conta,
      cargo = 'gestor_financeiro'
  where colaborador_id = meu_colaborador;
end $$;
