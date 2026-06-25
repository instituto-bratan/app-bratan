create table if not exists public.audit_event (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.colaborador(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_event_actor_id on public.audit_event(actor_id);
create index if not exists idx_audit_event_entity on public.audit_event(entity, entity_id);
create index if not exists idx_audit_event_created_at on public.audit_event(created_at desc);

alter table public.audit_event enable row level security;

drop policy if exists "audit_event_select_coordenacao" on public.audit_event;
create policy "audit_event_select_coordenacao"
on public.audit_event
for select
to authenticated
using (public.is_coordenacao(auth.uid()));

create or replace function public.write_audit_event(
  _action text,
  _entity text,
  _entity_id text default null,
  _metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _actor_id uuid;
  _event_id uuid;
begin
  select c.id
    into _actor_id
  from public.colaborador c
  where c.auth_id = auth.uid()
    and c.ativo = true
  limit 1;

  insert into public.audit_event (actor_id, action, entity, entity_id, metadata)
  values (_actor_id, _action, _entity, _entity_id, coalesce(_metadata, '{}'::jsonb))
  returning id into _event_id;

  return _event_id;
end;
$$;

grant execute on function public.has_cargo(uuid, public.cargo) to authenticated;
grant execute on function public.is_coordenacao(uuid) to authenticated;
grant execute on function public.can_comprovantes(uuid) to authenticated;
grant execute on function public.write_audit_event(text, text, text, jsonb) to authenticated;
