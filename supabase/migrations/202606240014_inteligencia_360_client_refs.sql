do $$
declare
  _table text;
begin
  foreach _table in array array[
    'weekly_average_ticket',
    'pricing_table',
    'prescriptions_sales',
    'objection_playbook',
    'patient_journey',
    'relationship_touchpoints',
    'retention_cohorts',
    'rescue_workflows',
    'churn_investigations',
    'patient_experience',
    'receivables',
    'action_items'
  ]
  loop
    execute format('alter table if exists public.%I add column if not exists client_ref text', _table);
    execute format('create unique index if not exists idx_%s_client_ref on public.%I(client_ref) where client_ref is not null', _table, _table);
  end loop;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'action_items'
      and column_name = 'source_id'
      and udt_name = 'uuid'
  ) then
    alter table public.action_items alter column source_id type text using source_id::text;
  end if;
end
$$;
