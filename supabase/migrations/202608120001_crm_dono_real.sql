-- CRM: A TAREFA TEM QUE TER DONO DE VERDADE (12/08/2026)
--
-- Bug relatado pelo Lucas: "a cadência de 14 em 14 dias da enfermeira não está
-- chegando pra ela".
--
-- O que a investigação mostrou (era geral, não só na enfermagem):
--   1. `assigned_to_user_id` guardava TEXTO DE CARGO em vez de pessoa:
--      28 tarefas de enfermagem em "enfermagem", 111 de SDR em "SDR",
--      6 de concierge em "concierge", 2 de recepção em "recepcao".
--   2. Pior: 8 inscrições da régua de enfermagem estavam no nome do ESTEVÃO,
--      porque a cadência herdava `deal.owner_user_id` — o dono COMERCIAL, quem
--      fechou a venda. A régua da enfermeira nascia no nome do vendedor.
--   3. Resultado: a Juliana Bonato não era dona de NENHUMA das 52 tarefas de
--      enfermagem. Ela conseguia até ver a lista (a RLS libera por cargo), mas
--      a tarefa aparecia com outra pessoa como responsável — e como ninguém
--      concluía, a régua parava no 1º ciclo: 12 inscrições geraram 11 tarefas,
--      uma por paciente, nenhum segundo ciclo. A da Gabrielli venceu 30/07 e
--      seguia pendente.
--
-- Esta migração é a REDE DE SEGURANÇA: um gatilho que resolve o dono a partir
-- do cargo sempre que o valor gravado não for uma pessoa real. Vale para
-- qualquer cliente que escreva no banco, hoje e no futuro.

-- ===========================================================================
-- 1. Cargo dono de cada papel do CRM
-- ===========================================================================
create or replace function public.crm_role_to_cargo(_role public.crm_role)
returns public.cargo
language sql
immutable
as $$
  select case _role
    when 'MEDICO' then 'dr_daniel'::public.cargo
    when 'ADMIN_GESTAO' then 'gestor'::public.cargo
    when 'FINANCEIRO' then 'gestor_financeiro'::public.cargo
    when 'SDR_LEADS' then 'marketing'::public.cargo
    when 'CONCIERGE' then 'secretaria_executiva'::public.cargo
    when 'RECEPCAO' then 'recepcionista'::public.cargo
    when 'ENFERMAGEM' then 'enfermeira'::public.cargo
    when 'PERFORMANCE' then 'nutricionista'::public.cargo
    else null
  end
$$;

-- Quem responde por este papel: colaborador ATIVO, com o cargo, E COM LOGIN.
-- Exigir login é de propósito: atribuir a alguém que não entra no app seria
-- trocar um dono falso por outro. Sem ninguém assim, devolve null e a tarefa
-- segue visível pelo cargo (a RLS já cobre isso).
create or replace function public.crm_role_owner(_role public.crm_role)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.id
  from public.colaborador c
  join public.colaborador_cargo cc on cc.colaborador_id = c.id
  where c.ativo = true
    and cc.cargo = public.crm_role_to_cargo(_role)
    and coalesce(cc.auth_id, c.auth_id) is not null
  order by c.created_at nulls last
  limit 1
$$;

comment on function public.crm_role_owner(public.crm_role) is
  'Pessoa que responde por um papel do CRM (ativa, com o cargo e com login). Base do gatilho que impede tarefa órfã. 12/08/2026.';

-- ===========================================================================
-- 2. Gatilho: normaliza o dono das TAREFAS
-- ===========================================================================
create or replace function public.crm_task_resolve_owner()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  dono uuid;
begin
  -- Já é uma pessoa real? Respeita (atribuição manual é soberana).
  if new.assigned_to_user_id is not null
     and exists (select 1 from public.colaborador where id::text = new.assigned_to_user_id) then
    return new;
  end if;
  if new.assigned_to_role is null then
    return new;
  end if;
  dono := public.crm_role_owner(new.assigned_to_role);
  if dono is not null then
    new.assigned_to_user_id := dono::text;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_task_resolve_owner on public.crm_tasks;
create trigger trg_crm_task_resolve_owner
before insert or update of assigned_to_user_id, assigned_to_role on public.crm_tasks
for each row execute function public.crm_task_resolve_owner();

-- ===========================================================================
-- 3. Gatilho: normaliza o dono das INSCRIÇÕES em cadência
-- ===========================================================================
create or replace function public.crm_enrollment_resolve_owner()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  dono uuid;
begin
  if new.owner_role is null then
    return new;
  end if;
  -- Aqui NÃO respeitamos "pessoa real" cegamente: era exatamente o caso do
  -- Estevão (pessoa real, papel errado) herdado do dono do deal. Se a pessoa
  -- gravada não tem o cargo do papel da cadência, corrige.
  if new.owner_user_id is not null
     and exists (
       select 1
       from public.colaborador c
       join public.colaborador_cargo cc on cc.colaborador_id = c.id
       where c.id::text = new.owner_user_id
         and cc.cargo = public.crm_role_to_cargo(new.owner_role)
     ) then
    return new;
  end if;
  dono := public.crm_role_owner(new.owner_role);
  if dono is not null then
    new.owner_user_id := dono::text;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_enrollment_resolve_owner on public.crm_cadence_enrollments;
create trigger trg_crm_enrollment_resolve_owner
before insert or update of owner_user_id, owner_role on public.crm_cadence_enrollments
for each row execute function public.crm_enrollment_resolve_owner();

-- ===========================================================================
-- 4. Conserto dos dados de hoje
-- ===========================================================================
-- Inscrições: dono passa a ser quem responde pelo papel da cadência.
update public.crm_cadence_enrollments e
   set owner_user_id = public.crm_role_owner(e.owner_role)::text,
       updated_at = now()
 where e.owner_role is not null
   and public.crm_role_owner(e.owner_role) is not null
   and coalesce(e.owner_user_id, '') <> public.crm_role_owner(e.owner_role)::text;

-- Tarefas ABERTAS sem dono real: recebem a pessoa do papel. As já resolvidas
-- ficam como estão — são histórico, e reescrever histórico seria mentira.
update public.crm_tasks t
   set assigned_to_user_id = public.crm_role_owner(t.assigned_to_role)::text,
       updated_at = now()
 where t.status not in ('DONE', 'CANCELED', 'SKIPPED')
   and t.assigned_to_role is not null
   and public.crm_role_owner(t.assigned_to_role) is not null
   and not exists (select 1 from public.colaborador c where c.id::text = t.assigned_to_user_id);

-- Tarefas de ENFERMAGEM abertas que estavam no nome de quem não é enfermeira
-- (o caso do Estevão) voltam para a enfermeira.
update public.crm_tasks t
   set assigned_to_user_id = public.crm_role_owner('ENFERMAGEM')::text,
       updated_at = now()
 where t.status not in ('DONE', 'CANCELED', 'SKIPPED')
   and t.assigned_to_role = 'ENFERMAGEM'
   and public.crm_role_owner('ENFERMAGEM') is not null
   and t.assigned_to_user_id <> public.crm_role_owner('ENFERMAGEM')::text;

-- Pacientes ativos sem enfermeira responsável: a enfermeira do cargo assume.
-- Sem isso ela vê a tarefa mas não abre o contato (canUserAccessContact pede
-- nurse_owner_id ou paciente ativo).
update public.crm_contacts ct
   set nurse_owner_id = public.crm_role_owner('ENFERMAGEM')::text,
       updated_at = now()
 where coalesce(ct.nurse_owner_id, '') = ''
   and public.crm_role_owner('ENFERMAGEM') is not null
   and (
     ct.lifecycle_stage = 'ACTIVE_PATIENT'
     or ct.client_ref in (select contact_id from public.crm_cadence_enrollments where cadence_id = 'cad-nursing-14')
   );
