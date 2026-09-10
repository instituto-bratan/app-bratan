-- SENHA DO GESTOR (10/09/2026, áudio da CEO: "eu acho que tem que ter mesmo uma
-- questão de proteção pra não poder editar. Mas alguém deveria ter essa senha de
-- proteção pra poder editar. Nem a gente vai no mercado e pode editar compras —
-- mas tem um gestor que coloca uma senha e ele consegue editar").
--
-- O computador da recepção fica logado o dia inteiro: só o cargo não protege
-- correção de fechamento. Esta é a trava física da mesa.
--
-- O HASH NUNCA SAI DO BANCO: a tabela não é legível por ninguém; quem confere e
-- quem define são estas funções SECURITY DEFINER. Só a gestão define/troca.
create table if not exists public.app_senha_gestor (
  id boolean primary key default true check (id),
  senha_hash text not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
alter table public.app_senha_gestor enable row level security;
-- Sem policy nenhuma: nem select. Só as funções abaixo tocam a tabela.
revoke all on public.app_senha_gestor from authenticated, anon;

-- Já existe senha configurada? (a tela precisa saber para pedir ou para ensinar a criar)
create or replace function public.senha_gestor_definida()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.app_senha_gestor where id);
$$;

-- Confere a senha digitada. Devolve só true/false — o hash não trafega.
create or replace function public.conferir_senha_gestor(_senha text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare _hash text;
begin
  select senha_hash into _hash from public.app_senha_gestor where id;
  if _hash is null then return false; end if;
  return _hash = crypt(_senha, _hash);
end;
$$;

-- Define/troca a senha. Só gestão (Lucas, Dr. Daniel, CEO).
create or replace function public.definir_senha_gestor(_senha text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_financeiro_full(auth.uid()) then
    raise exception 'Só a gestão pode definir a senha do gestor.';
  end if;
  if length(coalesce(_senha, '')) < 4 then
    raise exception 'A senha do gestor precisa de pelo menos 4 caracteres.';
  end if;
  insert into public.app_senha_gestor (id, senha_hash, atualizado_por)
  values (true, crypt(_senha, gen_salt('bf')), auth.uid())
  on conflict (id) do update
    set senha_hash = excluded.senha_hash, atualizado_em = now(), atualizado_por = excluded.atualizado_por;
end;
$$;

grant execute on function public.senha_gestor_definida() to authenticated;
grant execute on function public.conferir_senha_gestor(text) to authenticated;
grant execute on function public.definir_senha_gestor(text) to authenticated;
