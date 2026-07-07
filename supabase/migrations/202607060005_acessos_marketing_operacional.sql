-- Decisão do Lucas (06/07/2026): marketing deixa a coordenação e vira
-- operacional restrito (Hoje, Carteira, CRM e Documentos). A concierge
-- (secretaria_executiva) segue na coordenação com visão do financeiro.
create or replace function public.is_coordenacao(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.colaborador c
    join public.colaborador_cargo cc on cc.colaborador_id = c.id
    where c.ativo = true
      and coalesce(cc.auth_id, c.auth_id) = _user
      and cc.cargo in (
        'dr_daniel',
        'ceo',
        'gestor',
        'gestor_financeiro',
        'secretaria_executiva'
      )
  )
$$;
