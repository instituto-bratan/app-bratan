do $$
declare
  _table text;
begin
  foreach _table in array array[
    'weekly_average_ticket',
    'pricing_table',
    'prescriptions_sales',
    'patient_journey',
    'relationship_touchpoints',
    'retention_cohorts',
    'rescue_workflows',
    'churn_investigations',
    'patient_experience',
    'receivables',
    'action_items',
    'inteligencia_360_settings'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || _table || '_updated_at', _table);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', 'trg_' || _table || '_updated_at', _table);
  end loop;
end
$$;
