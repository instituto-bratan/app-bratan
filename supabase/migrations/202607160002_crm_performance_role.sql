-- POP v3.1: a nutricionista atua como Assistente de Performance do Dr. Daniel.
-- Novo papel no CRM + mapeamento do cargo na função de RLS.
alter type public.crm_role add value if not exists 'PERFORMANCE';

create or replace function public.crm_user_role(_user uuid)
returns public.crm_role
language sql
stable
security definer
set search_path = public
as $$
  select case cc.cargo
    when 'dr_daniel' then 'MEDICO'::public.crm_role
    when 'ceo' then 'SUPER_ADMIN'::public.crm_role
    when 'gestor' then 'ADMIN_GESTAO'::public.crm_role
    when 'gestor_financeiro' then 'FINANCEIRO'::public.crm_role
    when 'marketing' then 'SDR_LEADS'::public.crm_role
    when 'secretaria_executiva' then 'CONCIERGE'::public.crm_role
    when 'recepcionista' then 'RECEPCAO'::public.crm_role
    when 'enfermeira' then 'ENFERMAGEM'::public.crm_role
    when 'nutricionista' then 'PERFORMANCE'::public.crm_role
    else null
  end
  from public.colaborador c
  join public.colaborador_cargo cc on cc.colaborador_id = c.id
  where c.ativo = true
    and coalesce(cc.auth_id, c.auth_id) = _user
  limit 1
$$;
