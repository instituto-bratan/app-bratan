-- Rode este SQL no Supabase SQL Editor depois de criar o usuario em Authentication > Users.
-- E-mail de acesso: lucas.daniel@institutobratan.com.br
-- Cargo: gestor_financeiro

do $$
declare
  minha_conta uuid;
  meu_email text := 'lucas.daniel@institutobratan.com.br';
  meu_colaborador uuid := '00000000-0000-0000-0000-000000000004';
begin
  select id
  into minha_conta
  from auth.users
  where email = meu_email
  limit 1;

  if minha_conta is null then
    raise exception 'Conta nao encontrada em auth.users para o e-mail %', meu_email;
  end if;

  update public.colaborador
  set auth_id = minha_conta,
      nome = 'Lucas Daniel',
      email = meu_email,
      ativo = true
  where id = meu_colaborador;

  update public.colaborador_cargo
  set auth_id = minha_conta,
      cargo = 'gestor_financeiro'
  where colaborador_id = meu_colaborador;
end $$;
