-- SENHA DO GESTOR BLINDADA (29/09/2026, auditoria de segurança S3).
--
-- Por quê: a versão de 10/09 aceitava senha de 4 caracteres, gravava bcrypt de
-- custo 6 (padrão do gen_salt('bf')) e deixava QUALQUER pessoa logada chamar
-- conferir_senha_gestor sem limite — dava para tentar as 10 mil senhas de 4
-- dígitos em minutos pelo console do navegador.
--
-- Agora:
--   · senha nova com pelo menos 8 caracteres e bcrypt custo 10;
--   · contador POR USUÁRIO dentro da própria função: 5 erros seguidos travam
--     aquele login por 15 minutos; acertar zera o contador.
-- Não existe senha criada em produção (conferido em 29/09), então ninguém perde
-- acesso. Uma senha antiga de custo 6 continuaria conferindo (o custo vem no hash).
--
-- ATENÇÃO: a função NÃO pode dar raise depois de somar um erro (o raise desfaz o
-- update do contador). Por isso o erro devolve false e só o login já travado
-- recebe exceção (nada a gravar nesse caso).

create table if not exists public.app_senha_gestor_tentativa (
  auth_id uuid primary key,
  erros integer not null default 0,
  bloqueado_ate timestamptz,
  ultimo_erro_em timestamptz
);
alter table public.app_senha_gestor_tentativa enable row level security;
-- Sem policy: só as funções SECURITY DEFINER abaixo tocam a tabela.
revoke all on public.app_senha_gestor_tentativa from authenticated, anon;

create or replace function public.conferir_senha_gestor(_senha text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
  _uid uuid := auth.uid();
  _hash text;
  _tentativa public.app_senha_gestor_tentativa%rowtype;
  _erros integer;
begin
  if _uid is null then
    raise exception 'Entre no app para usar a senha do gestor.';
  end if;

  select * into _tentativa from public.app_senha_gestor_tentativa where auth_id = _uid for update;
  if _tentativa.bloqueado_ate is not null and _tentativa.bloqueado_ate > now() then
    raise exception 'Senha do gestor travada por excesso de erros. Tente de novo em % min.',
      greatest(1, ceil(extract(epoch from (_tentativa.bloqueado_ate - now())) / 60)::int);
  end if;

  select senha_hash into _hash from public.app_senha_gestor where id;
  if _hash is null then return false; end if;

  if _hash = crypt(coalesce(_senha, ''), _hash) then
    delete from public.app_senha_gestor_tentativa where auth_id = _uid;
    return true;
  end if;

  -- Erro: soma. Travado que já venceu recomeça do zero.
  _erros := case when _tentativa.bloqueado_ate is not null then 1 else coalesce(_tentativa.erros, 0) + 1 end;
  insert into public.app_senha_gestor_tentativa (auth_id, erros, bloqueado_ate, ultimo_erro_em)
  values (_uid, _erros, case when _erros >= 5 then now() + interval '15 minutes' else null end, now())
  on conflict (auth_id) do update
    set erros = excluded.erros, bloqueado_ate = excluded.bloqueado_ate, ultimo_erro_em = excluded.ultimo_erro_em;
  return false;
end;
$$;

create or replace function public.definir_senha_gestor(_senha text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_financeiro_full(auth.uid()) then
    raise exception 'Só a gestão pode definir a senha do gestor.';
  end if;
  if length(coalesce(_senha, '')) < 8 then
    raise exception 'A senha do gestor precisa de pelo menos 8 caracteres.';
  end if;
  insert into public.app_senha_gestor (id, senha_hash, atualizado_por)
  values (true, crypt(_senha, gen_salt('bf', 10)), auth.uid())
  on conflict (id) do update
    set senha_hash = excluded.senha_hash, atualizado_em = now(), atualizado_por = excluded.atualizado_por;
  -- Senha nova: ninguém fica preso pelos erros da senha antiga.
  -- ("where true": o pg-safeupdate recusa delete sem where.)
  delete from public.app_senha_gestor_tentativa where true;
end;
$$;

revoke all on function public.conferir_senha_gestor(text) from public, anon;
revoke all on function public.definir_senha_gestor(text) from public, anon;
grant execute on function public.conferir_senha_gestor(text) to authenticated;
grant execute on function public.definir_senha_gestor(text) to authenticated;

-- "Já existe senha?" continua só para quem está logado (antes o PUBLIC também executava).
revoke all on function public.senha_gestor_definida() from public, anon;
grant execute on function public.senha_gestor_definida() to authenticated;
