create or replace function public.deactivate_colaborador(_colaborador_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _actor_id uuid;
  _actor_auth_id uuid;
  _target_auth_id uuid;
  _target_cargo public.cargo;
  _remaining_coordenacao int;
begin
  if not public.is_coordenacao(auth.uid()) then
    raise exception 'forbidden';
  end if;

  select c.id, c.auth_id
    into _actor_id, _actor_auth_id
  from public.colaborador c
  where c.auth_id = auth.uid()
    and c.ativo = true
  limit 1;

  if _actor_id is null then
    raise exception 'actor_not_found';
  end if;

  select c.auth_id, cc.cargo
    into _target_auth_id, _target_cargo
  from public.colaborador c
  join public.colaborador_cargo cc on cc.colaborador_id = c.id
  where c.id = _colaborador_id
  limit 1;

  if _target_cargo is null then
    raise exception 'colaborador_not_found';
  end if;

  if _colaborador_id = _actor_id or _target_auth_id = _actor_auth_id then
    raise exception 'cannot_deactivate_self';
  end if;

  if _target_cargo in ('dr_daniel', 'ceo', 'gestor', 'gestor_financeiro', 'marketing', 'secretaria_executiva') then
    select count(*)
      into _remaining_coordenacao
    from public.colaborador c
    join public.colaborador_cargo cc on cc.colaborador_id = c.id
    where c.ativo = true
      and c.id <> _colaborador_id
      and cc.cargo in ('dr_daniel', 'ceo', 'gestor', 'gestor_financeiro', 'marketing', 'secretaria_executiva');

    if _remaining_coordenacao < 1 then
      raise exception 'cannot_deactivate_last_coordenacao';
    end if;
  end if;

  update public.colaborador
  set ativo = false,
      auth_id = null
  where id = _colaborador_id;

  update public.colaborador_cargo
  set auth_id = null
  where colaborador_id = _colaborador_id;

  insert into public.audit_event (actor_id, action, entity, entity_id, metadata)
  values (
    _actor_id,
    'colaborador.deactivate',
    'colaborador',
    _colaborador_id::text,
    jsonb_build_object('cargo', _target_cargo)
  );
end;
$$;

create or replace function public.reactivate_colaborador(_colaborador_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _actor_id uuid;
  _target_cargo public.cargo;
begin
  if not public.is_coordenacao(auth.uid()) then
    raise exception 'forbidden';
  end if;

  select c.id
    into _actor_id
  from public.colaborador c
  where c.auth_id = auth.uid()
    and c.ativo = true
  limit 1;

  if _actor_id is null then
    raise exception 'actor_not_found';
  end if;

  select cc.cargo
    into _target_cargo
  from public.colaborador c
  join public.colaborador_cargo cc on cc.colaborador_id = c.id
  where c.id = _colaborador_id
  limit 1;

  if _target_cargo is null then
    raise exception 'colaborador_not_found';
  end if;

  update public.colaborador
  set ativo = true
  where id = _colaborador_id;

  insert into public.audit_event (actor_id, action, entity, entity_id, metadata)
  values (
    _actor_id,
    'colaborador.reactivate',
    'colaborador',
    _colaborador_id::text,
    jsonb_build_object('cargo', _target_cargo)
  );
end;
$$;

grant execute on function public.deactivate_colaborador(uuid) to authenticated;
grant execute on function public.reactivate_colaborador(uuid) to authenticated;
