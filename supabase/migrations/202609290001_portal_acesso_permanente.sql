-- PORTAL: ACESSO PERMANENTE, FACE ID E VÁRIOS APARELHOS (29/09/2026)
--
-- Pedido do Lucas: "o link mágico tem que ser permanente... o paciente tem que
-- ter o login dele, o acesso dele. Não um link que expirasse." E: "Face ID no
-- lugar da senha, mas quando não se tem Face ID [fica a senha]".
--
-- O que muda no banco:
--  1. paciente_sessao — uma sessão POR APARELHO. Antes a sessão morava numa
--     coluna de paciente_acesso: entrar no celular derrubava o computador em
--     silêncio. As sessões que existem hoje são copiadas para cá, então
--     ninguém que está dentro é deslogado.
--  2. paciente_passkey — as chaves de acesso (Face ID, digital, senha do
--     aparelho). Só a CHAVE PÚBLICA fica aqui; a biometria nunca sai do celular.
--  3. paciente_webauthn_desafio — o desafio de uso único de cada tentativa,
--     vale 5 minutos.
--  4. portal_login_tentativa — freio por IP para a entrada com senha (antes
--     só havia bloqueio por conta, o que deixava qualquer um trancar o acesso
--     de um paciente sabendo o e-mail dele).
--
-- Tudo é lido e escrito SÓ pela Edge Function portal-paciente (chave de
-- serviço). Para a equipe, apenas leitura das sessões e aparelhos, sem hash e
-- sem chave, para quem cuida do portal (mesma regra de paciente_acesso).

create table if not exists public.paciente_sessao (
  id uuid primary key default gen_random_uuid(),
  acesso_id uuid not null references public.paciente_acesso(id) on delete cascade,
  contact_ref text not null,
  sessao_hash text not null unique,
  criada_em timestamptz not null default now(),
  expira_em timestamptz not null,
  ultimo_uso_em timestamptz,
  aparelho text,
  como_entrou text not null default 'LINK' check (como_entrou in ('LINK', 'SENHA', 'PASSKEY', 'MIGRADA')),
  revogada_em timestamptz
);
create index if not exists paciente_sessao_contato on public.paciente_sessao (contact_ref) where revogada_em is null;
create index if not exists paciente_sessao_acesso on public.paciente_sessao (acesso_id) where revogada_em is null;
alter table public.paciente_sessao enable row level security;

create table if not exists public.paciente_passkey (
  id uuid primary key default gen_random_uuid(),
  acesso_id uuid not null references public.paciente_acesso(id) on delete cascade,
  contact_ref text not null,
  credential_id text not null unique,
  chave_publica text not null,
  contador bigint not null default 0,
  transportes text[] not null default '{}',
  aparelho text,
  criada_em timestamptz not null default now(),
  ultimo_uso_em timestamptz,
  revogada_em timestamptz
);
create index if not exists paciente_passkey_contato on public.paciente_passkey (contact_ref) where revogada_em is null;
alter table public.paciente_passkey enable row level security;

create table if not exists public.paciente_webauthn_desafio (
  id uuid primary key default gen_random_uuid(),
  desafio text not null,
  tipo text not null check (tipo in ('REGISTRO', 'LOGIN')),
  acesso_id uuid references public.paciente_acesso(id) on delete cascade,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default (now() + interval '5 minutes'),
  usado_em timestamptz
);
alter table public.paciente_webauthn_desafio enable row level security;

create table if not exists public.portal_login_tentativa (
  id bigserial primary key,
  ip_hash text not null,
  criado_em timestamptz not null default now()
);
create index if not exists portal_login_tentativa_ip on public.portal_login_tentativa (ip_hash, criado_em desc);
alter table public.portal_login_tentativa enable row level security;

-- Leitura para quem cuida do portal (lista de aparelhos na ficha), sem segredo.
drop policy if exists paciente_sessao_select on public.paciente_sessao;
create policy paciente_sessao_select on public.paciente_sessao
  for select to authenticated using ((select public.can_paciente_portal_read(auth.uid())));
drop policy if exists paciente_passkey_select on public.paciente_passkey;
create policy paciente_passkey_select on public.paciente_passkey
  for select to authenticated using ((select public.can_paciente_portal_read(auth.uid())));
-- O hash da sessão e a chave pública nunca vão para a tela: a equipe só
-- enxerga as colunas abaixo (revoga a tabela inteira e devolve coluna a coluna).
revoke all on public.paciente_sessao from anon, authenticated;
revoke all on public.paciente_passkey from anon, authenticated;
revoke all on public.paciente_webauthn_desafio from anon, authenticated;
revoke all on public.portal_login_tentativa from anon, authenticated;
grant select (id, acesso_id, contact_ref, criada_em, expira_em, ultimo_uso_em, aparelho, como_entrou, revogada_em) on public.paciente_sessao to authenticated;
grant select (id, acesso_id, contact_ref, aparelho, criada_em, ultimo_uso_em, revogada_em) on public.paciente_passkey to authenticated;

-- As sessões de hoje viram a primeira linha de cada aparelho (ninguém sai).
insert into public.paciente_sessao (acesso_id, contact_ref, sessao_hash, criada_em, expira_em, ultimo_uso_em, aparelho, como_entrou)
select a.id, a.contact_ref, a.sessao_hash, coalesce(a.usado_em, a.criado_em), greatest(coalesce(a.sessao_expira_em, now()), now() + interval '180 days'), a.ultimo_acesso_em, a.aparelho, 'MIGRADA'
from public.paciente_acesso a
where a.sessao_hash is not null and a.revogado_em is null
on conflict (sessao_hash) do nothing;

-- Limpeza: desafio vencido e tentativa com mais de um dia não servem para nada.
create or replace function public.portal_limpar_temporarios()
returns void language sql security definer set search_path = public as $$
  delete from public.paciente_webauthn_desafio where expira_em < now() - interval '1 hour';
  delete from public.portal_login_tentativa where criado_em < now() - interval '1 day';
$$;
revoke all on function public.portal_limpar_temporarios() from public, anon, authenticated;

-- TROCAR SÓ O LINK (29/09/2026). A equipe não tem permissão de escrever
-- token_hash direto (só revogar). Quando a recepção gera um "novo link" para
-- quem já tem acesso, esta função troca o link e mantém o resto — senha, Face
-- ID e aparelhos do paciente continuam valendo. Sem acesso ativo, cria um.
create or replace function public.portal_trocar_link(p_contact_ref text, p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not (select public.can_paciente_portal_write(auth.uid())) then
    raise exception 'sem permissão para o portal do paciente' using errcode = '42501';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'link inválido' using errcode = '22023';
  end if;
  select id into v_id from public.paciente_acesso
   where contact_ref = p_contact_ref and revogado_em is null
   order by criado_em desc limit 1;
  if v_id is null then
    insert into public.paciente_acesso (contact_ref, token_hash, expira_em, criado_por)
    values (p_contact_ref, p_token_hash, '2099-12-31T23:59:59Z', auth.uid())
    returning id into v_id;
  else
    update public.paciente_acesso set token_hash = p_token_hash, expira_em = '2099-12-31T23:59:59Z' where id = v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.portal_trocar_link(text, text) from public, anon;
grant execute on function public.portal_trocar_link(text, text) to authenticated;
