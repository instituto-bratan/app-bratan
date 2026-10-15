-- A FICHA CADASTRAL QUE O CONTRATO PREENCHE E REAPROVEITA (15/10/2026).
--
-- Lucas: "quando preencher tudo isso, já atualiza no cadastro... se for para
-- escrever tudo, a gente já faz isso". O contrato de medicação pede dados que o
-- CRM não guardava (RG, estado civil, profissão, nascimento, endereço). Agora:
--   1. contato_ficha guarda esses dados por paciente;
--   2. contrato_cadastro_do_contato(ref) devolve ficha + CPF + e-mail + telefone
--      para a tela de contratos se preencher sozinha;
--   3. contrato_salvar_cadastro(ref, dados) grava de volta ao gerar o contrato:
--      ficha (valor novo vence; campo vazio não apaga), CPF em contato_documento
--      e e-mail/telefone no CRM só quando lá estiverem vazios.
-- Quem lê e grava a ficha: a mesma regra do contrato (pode_contrato:
-- coordenação e recepção). O CPF continua com a regra de contato_documento:
-- só coordenação/financeiro/fin-impostos LEEM; a recepção grava o CPF que
-- ainda não existe, mas não lê nem troca um CPF já gravado.

create table if not exists public.contato_ficha (
  contact_ref text primary key,
  nacionalidade text,
  estado_civil text,
  profissao text,
  rg text,
  nascimento date,
  endereco text,
  numero text,
  bairro text,
  municipio text,
  uf text,
  cep text,
  atualizado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now()
);

alter table public.contato_ficha enable row level security;

drop policy if exists contato_ficha_select on public.contato_ficha;
create policy contato_ficha_select on public.contato_ficha
for select to authenticated using ((select public.pode_contrato(auth.uid())));

drop policy if exists contato_ficha_write on public.contato_ficha;
create policy contato_ficha_write on public.contato_ficha
for all to authenticated
using ((select public.pode_contrato(auth.uid())))
with check ((select public.pode_contrato(auth.uid())));

-- A mesma regra das políticas de contato_documento (ver e trocar CPF).
create or replace function public.pode_ver_cpf(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_coordenacao(_user) or public.is_financeiro_full(_user)
      or public.module_access_override(_user, 'fin-impostos') in ('VER', 'EDITAR')
$$;

create or replace function public.pode_trocar_cpf(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_coordenacao(_user) or public.is_financeiro_full(_user)
      or public.module_access_override(_user, 'fin-impostos') = 'EDITAR'
$$;

create or replace function public.contrato_cadastro_do_contato(_contact_ref text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.pode_contrato(auth.uid()) then
    raise exception 'Sem permissão para ver o cadastro do contrato.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'ficha', (select to_jsonb(f) - 'atualizado_por' from public.contato_ficha f where f.contact_ref = _contact_ref),
    'cpf', (select d.cpf from public.contato_documento d where d.contact_ref = _contact_ref and public.pode_ver_cpf(auth.uid())),
    'tem_cpf', exists (select 1 from public.contato_documento d where d.contact_ref = _contact_ref),
    'email', (select nullif(btrim(c.email), '') from public.crm_contacts c where c.client_ref = _contact_ref),
    'telefone', (select coalesce(nullif(btrim(c.whatsapp), ''), nullif(btrim(c.phone), '')) from public.crm_contacts c where c.client_ref = _contact_ref)
  );
end;
$$;
revoke execute on function public.contrato_cadastro_do_contato(text) from public, anon;
grant execute on function public.contrato_cadastro_do_contato(text) to authenticated;

drop function if exists public.contrato_salvar_cadastro(text, jsonb);
create or replace function public.contrato_salvar_cadastro(_contact_ref text, _dados jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _cpf text := regexp_replace(coalesce(_dados->>'cpf', ''), '\D', '', 'g');
  _nasc date;
  _email text := lower(btrim(coalesce(_dados->>'email', '')));
  _tel text := btrim(coalesce(_dados->>'telefone', ''));
  v text;
  _cpf_atual text;
  _cpf_status text := null;
begin
  if not public.pode_contrato(auth.uid()) then
    raise exception 'Sem permissão para atualizar o cadastro.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.crm_contacts c where c.client_ref = _contact_ref) then
    raise exception 'Paciente não encontrado no CRM.';
  end if;
  -- Data de nascimento inválida não derruba o contrato: só não é gravada.
  begin
    _nasc := nullif(_dados->>'nascimento', '')::date;
  exception when others then
    _nasc := null;
  end;

  insert into public.contato_ficha as f (contact_ref, nacionalidade, estado_civil, profissao, rg, nascimento, endereco, numero, bairro, municipio, uf, cep, atualizado_por, atualizado_em)
  values (
    _contact_ref,
    nullif(btrim(_dados->>'nacionalidade'), ''),
    nullif(btrim(_dados->>'estadoCivil'), ''),
    nullif(btrim(_dados->>'profissao'), ''),
    nullif(btrim(_dados->>'rg'), ''),
    _nasc,
    nullif(btrim(_dados->>'endereco'), ''),
    nullif(btrim(_dados->>'numeroEnd'), ''),
    nullif(btrim(_dados->>'bairro'), ''),
    nullif(btrim(_dados->>'municipio'), ''),
    nullif(upper(btrim(_dados->>'uf')), ''),
    nullif(btrim(_dados->>'cep'), ''),
    auth.uid(),
    now()
  )
  on conflict (contact_ref) do update set
    nacionalidade = coalesce(excluded.nacionalidade, f.nacionalidade),
    estado_civil = coalesce(excluded.estado_civil, f.estado_civil),
    profissao = coalesce(excluded.profissao, f.profissao),
    rg = coalesce(excluded.rg, f.rg),
    nascimento = coalesce(excluded.nascimento, f.nascimento),
    endereco = coalesce(excluded.endereco, f.endereco),
    numero = coalesce(excluded.numero, f.numero),
    bairro = coalesce(excluded.bairro, f.bairro),
    municipio = coalesce(excluded.municipio, f.municipio),
    uf = coalesce(excluded.uf, f.uf),
    cep = coalesce(excluded.cep, f.cep),
    atualizado_por = auth.uid(),
    atualizado_em = now();

  -- CPF: só com 11 dígitos. Sem CPF gravado, grava. Já gravado e diferente:
  -- só troca quem pode trocar (a recepção não sobrescreve o que o financeiro conferiu).
  if length(_cpf) = 11 then
    select d.cpf into _cpf_atual from public.contato_documento d where d.contact_ref = _contact_ref;
    if _cpf_atual is null then
      insert into public.contato_documento (contact_ref, cpf, atualizado_por, atualizado_em)
      values (_contact_ref, _cpf, auth.uid(), now());
      _cpf_status := 'gravado';
    elsif _cpf_atual = _cpf then
      _cpf_status := 'igual';
    elsif public.pode_trocar_cpf(auth.uid()) then
      update public.contato_documento set cpf = _cpf, atualizado_por = auth.uid(), atualizado_em = now() where contact_ref = _contact_ref;
      _cpf_status := 'trocado';
    else
      _cpf_status := 'mantido';
    end if;
  end if;

  -- E-mail e telefone no CRM: só preenche o que estiver vazio (nunca troca o que a equipe já pôs).
  if _email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    update public.crm_contacts set email = _email, updated_at = now() where client_ref = _contact_ref and coalesce(btrim(email), '') = '';
  end if;
  v := regexp_replace(_tel, '\D', '', 'g');
  if length(v) >= 10 then
    update public.crm_contacts set phone = _tel, updated_at = now() where client_ref = _contact_ref and coalesce(btrim(phone), '') = '' and coalesce(btrim(whatsapp), '') = '';
  end if;
  return jsonb_build_object('cpf', _cpf_status);
end;
$$;
revoke execute on function public.contrato_salvar_cadastro(text, jsonb) from public, anon;
grant execute on function public.contrato_salvar_cadastro(text, jsonb) to authenticated;
revoke execute on function public.pode_ver_cpf(uuid) from public, anon;
grant execute on function public.pode_ver_cpf(uuid) to authenticated;
revoke execute on function public.pode_trocar_cpf(uuid) from public, anon;
grant execute on function public.pode_trocar_cpf(uuid) to authenticated;
