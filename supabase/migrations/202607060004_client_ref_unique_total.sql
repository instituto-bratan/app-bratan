-- Os índices únicos de client_ref das tabelas da Inteligência 360 eram parciais
-- (WHERE client_ref IS NOT NULL). O ON CONFLICT (client_ref) usado pelo app não
-- consegue inferir índice parcial e todo upsert falhava com 42P10 — foi o
-- "Não foi possível salvar no Supabase" dos Lembretes de pagamento.
-- Constraint única total resolve; múltiplos NULLs continuam permitidos.

do $$
declare
  t text;
begin
  foreach t in array array[
    'action_items',
    'churn_investigations',
    'objection_playbook',
    'patient_experience',
    'patient_journey',
    'prescriptions_sales',
    'pricing_table',
    'receivables',
    'relationship_touchpoints',
    'rescue_workflows',
    'retention_cohorts',
    'weekly_average_ticket'
  ]
  loop
    execute format('drop index if exists public.idx_%I_client_ref', t);
    execute format(
      'alter table public.%I drop constraint if exists %I',
      t, t || '_client_ref_key'
    );
    execute format(
      'alter table public.%I add constraint %I unique (client_ref)',
      t, t || '_client_ref_key'
    );
  end loop;
end $$;
