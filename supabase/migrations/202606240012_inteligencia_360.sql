do $$
begin
  if not exists (select 1 from pg_type where typname = 'patient_type_360') then
    create type public.patient_type_360 as enum ('NEW', 'RETURNING');
  end if;
  if not exists (select 1 from pg_type where typname = 'ticket_status_360') then
    create type public.ticket_status_360 as enum ('ABOVE_TARGET', 'ON_TARGET', 'BELOW_TARGET', 'CRITICAL');
  end if;
  if not exists (select 1 from pg_type where typname = 'root_cause_category_360') then
    create type public.root_cause_category_360 as enum (
      'LEAD_MISALIGNMENT',
      'WRONG_PERSONA',
      'TOO_MUCH_DISCOUNT',
      'LOW_PRESCRIPTION_VALUE',
      'LOW_CONVERSION',
      'LOW_ATTENDANCE_VOLUME',
      'MIX_OF_RETURNING_PATIENTS',
      'COMMERCIAL_EXECUTION',
      'OTHER'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'repasse_type_360') then
    create type public.repasse_type_360 as enum ('FIXED', 'PERCENTAGE');
  end if;
  if not exists (select 1 from pg_type where typname = 'objection_category_360') then
    create type public.objection_category_360 as enum (
      'PRICE',
      'TRUST',
      'TIMING',
      'SPOUSE_OR_FAMILY',
      'PAYMENT_METHOD',
      'NEEDS_MORE_INFORMATION',
      'NO_PERCEIVED_VALUE',
      'OTHER'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'prescription_status_360') then
    create type public.prescription_status_360 as enum ('PRESCRIBED', 'CLOSED_FULL', 'CLOSED_PARTIAL', 'NOT_CLOSED', 'IN_RECOVERY', 'LOST');
  end if;
  if not exists (select 1 from pg_type where typname = 'journey_stage_360') then
    create type public.journey_stage_360 as enum (
      'MEDICAL_CONSULTATION',
      'SALES',
      'SCHEDULING',
      'NURSING',
      'CONCIERGE',
      'ADMINISTRATIVE',
      'FOLLOW_UP',
      'RESCUE',
      'CHURN',
      'COMPLETED'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'touch_type_360') then
    create type public.touch_type_360 as enum (
      'D1_CONCIERGE',
      'NURSE_14_DAYS',
      'MONTHLY_CHECKPOINT',
      'EXAM_REQUEST_3_WEEKS',
      'EXAM_READY_1_WEEK',
      'CONSULTATION_CONFIRMATION_3_DAYS',
      'CONSULTATION_REMINDER_1_DAY',
      'RETURN_CONSULTATION',
      'ONE_YEAR_ANNIVERSARY',
      'INSTAGRAM_INVITE',
      'RESCUE_ATTEMPT',
      'CHURN_INVESTIGATION'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'touch_status_360') then
    create type public.touch_status_360 as enum ('PENDING', 'SENT', 'RESPONDED', 'PAUSED', 'CANCELED', 'FAILED');
  end if;
  if not exists (select 1 from pg_type where typname = 'touch_channel_360') then
    create type public.touch_channel_360 as enum ('WHATSAPP', 'CALL', 'EMAIL', 'IN_PERSON', 'OTHER');
  end if;
  if not exists (select 1 from pg_type where typname = 'rescue_type_360') then
    create type public.rescue_type_360 as enum ('TRADITIONAL_60_DAYS', 'SIX_MONTHS', 'ONE_YEAR');
  end if;
  if not exists (select 1 from pg_type where typname = 'rescue_status_360') then
    create type public.rescue_status_360 as enum ('OPEN', 'IN_PROGRESS', 'RESCUED', 'NOT_RESCUED', 'CHURN_INVESTIGATION', 'CLOSED');
  end if;
  if not exists (select 1 from pg_type where typname = 'churn_reason_category_360') then
    create type public.churn_reason_category_360 as enum (
      'OPERATIONAL_FRICTION',
      'EXAM_OR_SCHEDULING_PROBLEM',
      'PRICE',
      'NO_PERCEIVED_VALUE',
      'BAD_EXPERIENCE',
      'HEALTH_OR_PERSONAL_REASON',
      'MOVED_AWAY',
      'NO_RESPONSE',
      'OTHER'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'feedback_type_360') then
    create type public.feedback_type_360 as enum ('PRAISE', 'CRITICISM', 'SUGGESTION', 'COMPLAINT');
  end if;
  if not exists (select 1 from pg_type where typname = 'experience_status_360') then
    create type public.experience_status_360 as enum ('OPEN', 'IN_REVIEW', 'RESOLVED');
  end if;
  if not exists (select 1 from pg_type where typname = 'receivable_status_360') then
    create type public.receivable_status_360 as enum ('OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELED');
  end if;
  if not exists (select 1 from pg_type where typname = 'collection_status_360') then
    create type public.collection_status_360 as enum ('NOT_STARTED', 'FIRST_CONTACT', 'NEGOTIATION', 'PROMISED_PAYMENT', 'ESCALATED', 'RESOLVED');
  end if;
  if not exists (select 1 from pg_type where typname = 'action_source_module_360') then
    create type public.action_source_module_360 as enum ('TICKET_AVERAGE', 'PRESCRIPTION_CONVERSION', 'RETENTION', 'RESCUE', 'CHURN', 'NPS', 'RECEIVABLES', 'PRICING', 'MANUAL');
  end if;
  if not exists (select 1 from pg_type where typname = 'action_priority_360') then
    create type public.action_priority_360 as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
  end if;
  if not exists (select 1 from pg_type where typname = 'action_status_360') then
    create type public.action_status_360 as enum ('OPEN', 'IN_PROGRESS', 'WAITING', 'DONE', 'CANCELED');
  end if;
  if not exists (select 1 from pg_type where typname = 'expected_impact_360') then
    create type public.expected_impact_360 as enum ('CASH', 'MARGIN', 'PATIENT_EXPERIENCE', 'CONVERSION', 'RETENTION', 'PROCESS');
  end if;
end
$$;

create or replace function public.can_inteligencia_360_read(_user uuid)
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
  )
$$;

create or replace function public.can_inteligencia_360_write(_user uuid, _module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_coordenacao(_user)
    or exists (
      select 1
      from public.colaborador c
      join public.colaborador_cargo cc on cc.colaborador_id = c.id
      where c.ativo = true
        and coalesce(cc.auth_id, c.auth_id) = _user
        and (
          (_module in ('patient_journey', 'relationship_touchpoints') and cc.cargo in ('recepcionista', 'enfermeira', 'nutricionista', 'secretaria_executiva'))
          or (_module = 'patient_experience' and cc.cargo in ('secretaria_executiva', 'recepcionista'))
          or (_module = 'receivables' and cc.cargo in ('recepcionista', 'gestor_financeiro'))
        )
    )
$$;

create table if not exists public.weekly_average_ticket (
  id uuid primary key default gen_random_uuid(),
  week_start_date date not null,
  week_end_date date not null,
  reference_month text not null,
  doctor_id uuid references public.colaborador(id) on delete set null,
  doctor_name text not null,
  patient_type public.patient_type_360 not null,
  patients_seen_count integer not null default 0 check (patients_seen_count >= 0),
  patients_closed_count integer not null default 0 check (patients_closed_count >= 0),
  total_sold_amount numeric(14,2) not null default 0 check (total_sold_amount >= 0),
  total_received_amount numeric(14,2) not null default 0 check (total_received_amount >= 0),
  average_ticket_sold numeric(14,2) generated always as (case when patients_closed_count > 0 then total_sold_amount / patients_closed_count else 0 end) stored,
  average_ticket_received numeric(14,2) generated always as (case when patients_closed_count > 0 then total_received_amount / patients_closed_count else 0 end) stored,
  target_average_ticket numeric(14,2) not null default 0,
  previous_week_average_ticket numeric(14,2) not null default 0,
  variation_percentage numeric(8,2) generated always as (case when previous_week_average_ticket > 0 and patients_closed_count > 0 then (((total_sold_amount / patients_closed_count) - previous_week_average_ticket) / previous_week_average_ticket) * 100 else 0 end) stored,
  status public.ticket_status_360 not null default 'ON_TARGET',
  main_hypothesis text,
  root_cause_category public.root_cause_category_360 not null default 'OTHER',
  action_plan text,
  responsible_user_id uuid references public.colaborador(id) on delete set null,
  due_date date,
  notes text,
  created_by uuid references public.colaborador(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pricing_table (
  id uuid primary key default gen_random_uuid(),
  service_name text not null,
  category text not null,
  standard_price numeric(14,2) not null default 0,
  bratan_price numeric(14,2) not null default 0,
  direct_cost numeric(14,2) not null default 0,
  medication_cost numeric(14,2) not null default 0,
  lab_cost numeric(14,2) not null default 0,
  card_fee_percentage numeric(6,2) not null default 0,
  doctor_repasse_type public.repasse_type_360 not null default 'PERCENTAGE',
  doctor_repasse_value numeric(14,2) not null default 0,
  other_variable_costs numeric(14,2) not null default 0,
  total_estimated_cost numeric(14,2) generated always as (
    direct_cost + medication_cost + lab_cost + other_variable_costs + (bratan_price * card_fee_percentage / 100) +
    case when doctor_repasse_type = 'PERCENTAGE' then bratan_price * doctor_repasse_value / 100 else doctor_repasse_value end
  ) stored,
  gross_margin_amount numeric(14,2) generated always as (
    bratan_price - (direct_cost + medication_cost + lab_cost + other_variable_costs + (bratan_price * card_fee_percentage / 100) +
    case when doctor_repasse_type = 'PERCENTAGE' then bratan_price * doctor_repasse_value / 100 else doctor_repasse_value end)
  ) stored,
  gross_margin_percentage numeric(8,2) generated always as (
    case when bratan_price > 0 then ((bratan_price - (direct_cost + medication_cost + lab_cost + other_variable_costs + (bratan_price * card_fee_percentage / 100) +
    case when doctor_repasse_type = 'PERCENTAGE' then bratan_price * doctor_repasse_value / 100 else doctor_repasse_value end)) / bratan_price) * 100 else 0 end
  ) stored,
  max_discount_percentage numeric(6,2) not null default 0,
  minimum_allowed_price numeric(14,2) generated always as (bratan_price * (1 - max_discount_percentage / 100)) stored,
  strategic_high_margin boolean not null default false,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prescriptions_sales (
  id uuid primary key default gen_random_uuid(),
  patient_reference text not null,
  patient_type public.patient_type_360 not null,
  doctor_id uuid references public.colaborador(id) on delete set null,
  seller_id uuid references public.colaborador(id) on delete set null,
  consultation_date date not null,
  prescribed_amount numeric(14,2) not null default 0,
  sold_amount numeric(14,2) not null default 0,
  received_amount numeric(14,2) not null default 0,
  closed boolean not null default false,
  full_plan_closed boolean not null default false,
  partial_reason text,
  discount_percentage numeric(6,2) not null default 0,
  payment_method text,
  installments integer not null default 0,
  acquisition_channel text,
  main_objection text,
  objection_category public.objection_category_360 not null default 'OTHER',
  next_follow_up_date date,
  status public.prescription_status_360 not null default 'PRESCRIBED',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.objection_playbook (
  id uuid primary key default gen_random_uuid(),
  objection_category public.objection_category_360 not null,
  objection_text text not null,
  recommended_response text not null,
  examples text,
  active boolean not null default true
);

create table if not exists public.patient_journey (
  id uuid primary key default gen_random_uuid(),
  patient_reference text not null,
  patient_type public.patient_type_360 not null,
  current_stage public.journey_stage_360 not null,
  doctor_id uuid references public.colaborador(id) on delete set null,
  seller_id uuid references public.colaborador(id) on delete set null,
  concierge_id uuid references public.colaborador(id) on delete set null,
  nurse_id uuid references public.colaborador(id) on delete set null,
  admin_id uuid references public.colaborador(id) on delete set null,
  treatment_plan_summary text,
  prescription_sent boolean not null default false,
  treatment_group_sent boolean not null default false,
  pharmacy_group_sent boolean not null default false,
  pmi_completed boolean not null default false,
  contract_created boolean not null default false,
  contract_sent boolean not null default false,
  contract_signed boolean not null default false,
  first_dose_scheduled boolean not null default false,
  first_bioimpedance_scheduled boolean not null default false,
  all_dates_scheduled boolean not null default false,
  next_medical_return_date date,
  next_exam_due_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.relationship_touchpoints (
  id uuid primary key default gen_random_uuid(),
  patient_reference text not null,
  journey_id uuid references public.patient_journey(id) on delete set null,
  touch_type public.touch_type_360 not null,
  scheduled_date date not null,
  sent_date timestamptz,
  responsible_role text not null,
  responsible_user_id uuid references public.colaborador(id) on delete set null,
  status public.touch_status_360 not null default 'PENDING',
  channel public.touch_channel_360 not null default 'WHATSAPP',
  message_template_id text,
  manual_message_text text,
  response_summary text,
  opt_out boolean not null default false,
  fatigue_risk boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.retention_cohorts (
  id uuid primary key default gen_random_uuid(),
  cohort_month text not null,
  cohort_label text not null,
  total_patients integer not null default 0,
  scheduled_returns integer not null default 0,
  attended_returns integer not null default 0,
  missed_returns integer not null default 0,
  retention_rate numeric(8,2) generated always as (case when scheduled_returns > 0 then attended_returns::numeric / scheduled_returns * 100 else 0 end) stored,
  patient_type text not null default 'MIXED',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rescue_workflows (
  id uuid primary key default gen_random_uuid(),
  patient_reference text not null,
  rescue_type public.rescue_type_360 not null,
  trigger_date date not null,
  attempts_total integer not null default 5,
  attempts_done integer not null default 0,
  status public.rescue_status_360 not null default 'OPEN',
  rescued_criteria text,
  owner_user_id uuid references public.colaborador(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.churn_investigations (
  id uuid primary key default gen_random_uuid(),
  patient_reference text not null,
  rescue_workflow_id uuid references public.rescue_workflows(id) on delete set null,
  investigator_user_id uuid references public.colaborador(id) on delete set null,
  call_date date,
  answered boolean not null default false,
  churn_reason_category public.churn_reason_category_360 not null default 'OTHER',
  churn_reason_detail text,
  corrective_action text,
  responsible_user_id uuid references public.colaborador(id) on delete set null,
  due_date date,
  status text not null default 'OPEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patient_experience (
  id uuid primary key default gen_random_uuid(),
  patient_reference text not null,
  journey_id uuid references public.patient_journey(id) on delete set null,
  nps_score integer check (nps_score is null or nps_score between 0 and 10),
  satisfaction_score integer check (satisfaction_score is null or satisfaction_score between 0 and 10),
  google_review_requested boolean not null default false,
  google_review_done boolean not null default false,
  leadership_contact_done boolean not null default false,
  leadership_contact_date date,
  feedback_type public.feedback_type_360,
  feedback_text text,
  action_required boolean not null default false,
  action_plan_id uuid,
  status public.experience_status_360 not null default 'OPEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.receivables (
  id uuid primary key default gen_random_uuid(),
  patient_reference text not null,
  sale_id uuid references public.prescriptions_sales(id) on delete set null,
  total_amount numeric(14,2) not null default 0,
  received_amount numeric(14,2) not null default 0,
  open_amount numeric(14,2) generated always as (greatest(total_amount - received_amount, 0)) stored,
  due_date date not null,
  payment_method text,
  installments integer not null default 1,
  status public.receivable_status_360 not null default 'OPEN',
  owner_user_id uuid references public.colaborador(id) on delete set null,
  collection_status public.collection_status_360 not null default 'NOT_STARTED',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.action_items (
  id uuid primary key default gen_random_uuid(),
  source_module public.action_source_module_360 not null,
  source_id uuid,
  title text not null,
  description text,
  priority public.action_priority_360 not null default 'MEDIUM',
  owner_user_id uuid references public.colaborador(id) on delete set null,
  due_date date,
  status public.action_status_360 not null default 'OPEN',
  expected_impact public.expected_impact_360 not null default 'PROCESS',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inteligencia_360_settings (
  id boolean primary key default true,
  monthly_revenue_target numeric(14,2) not null default 0,
  weekly_revenue_target numeric(14,2) not null default 0,
  daily_revenue_target numeric(14,2) not null default 0,
  general_average_ticket_target numeric(14,2) not null default 0,
  ticket_drop_critical_percentage numeric(6,2) not null default 10,
  prescription_conversion_min numeric(6,2) not null default 70,
  prescription_conversion_max numeric(6,2) not null default 80,
  max_default_discount_percentage numeric(6,2) not null default 10,
  max_messages_per_cycle integer not null default 8,
  area_owners jsonb not null default '{}'::jsonb,
  origin_system text not null default 'Manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inteligencia_360_settings_singleton check (id = true)
);

create table if not exists public.dashboard_360_snapshots (
  id uuid primary key default gen_random_uuid(),
  reference_date date not null,
  reference_week text not null,
  reference_month text not null,
  total_sold_amount numeric(14,2) not null default 0,
  total_received_amount numeric(14,2) not null default 0,
  total_open_receivables numeric(14,2) not null default 0,
  total_overdue_receivables numeric(14,2) not null default 0,
  average_ticket_general numeric(14,2) not null default 0,
  average_ticket_new_patients numeric(14,2) not null default 0,
  average_ticket_returning_patients numeric(14,2) not null default 0,
  prescription_conversion_rate numeric(8,2) not null default 0,
  retention_rate numeric(8,2) not null default 0,
  rescue_open_count integer not null default 0,
  churn_count integer not null default 0,
  nps_average numeric(5,2) not null default 0,
  critical_actions_count integer not null default 0,
  overdue_actions_count integer not null default 0,
  data_completeness_score integer not null default 0,
  generated_at timestamptz not null default now()
);

create index if not exists idx_weekly_average_ticket_week on public.weekly_average_ticket(week_start_date desc, doctor_name, patient_type);
create index if not exists idx_prescriptions_sales_date on public.prescriptions_sales(consultation_date desc);
create index if not exists idx_patient_journey_stage on public.patient_journey(current_stage);
create index if not exists idx_relationship_touchpoints_status on public.relationship_touchpoints(status, scheduled_date);
create index if not exists idx_receivables_status_due on public.receivables(status, due_date);
create index if not exists idx_action_items_status_due on public.action_items(status, due_date);

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

alter table public.weekly_average_ticket enable row level security;
alter table public.pricing_table enable row level security;
alter table public.prescriptions_sales enable row level security;
alter table public.objection_playbook enable row level security;
alter table public.patient_journey enable row level security;
alter table public.relationship_touchpoints enable row level security;
alter table public.retention_cohorts enable row level security;
alter table public.rescue_workflows enable row level security;
alter table public.churn_investigations enable row level security;
alter table public.patient_experience enable row level security;
alter table public.receivables enable row level security;
alter table public.action_items enable row level security;
alter table public.inteligencia_360_settings enable row level security;
alter table public.dashboard_360_snapshots enable row level security;

do $$
declare
  _table text;
  _module text;
begin
  for _table, _module in
    select *
    from (
      values
        ('weekly_average_ticket','weekly_average_ticket'),
        ('pricing_table','pricing_table'),
        ('prescriptions_sales','prescriptions_sales'),
        ('objection_playbook','prescriptions_sales'),
        ('patient_journey','patient_journey'),
        ('relationship_touchpoints','relationship_touchpoints'),
        ('retention_cohorts','retention_cohorts'),
        ('rescue_workflows','rescue_workflows'),
        ('churn_investigations','rescue_workflows'),
        ('patient_experience','patient_experience'),
        ('receivables','receivables'),
        ('action_items','action_items'),
        ('inteligencia_360_settings','settings'),
        ('dashboard_360_snapshots','dashboard_360_snapshots')
    ) as modules(table_name, module_name)
  loop
    execute format('drop policy if exists "%s_select_inteligencia_360" on public.%I', _table, _table);
    execute format('create policy "%s_select_inteligencia_360" on public.%I for select to authenticated using (public.can_inteligencia_360_read(auth.uid()))', _table, _table);
    execute format('drop policy if exists "%s_insert_inteligencia_360" on public.%I', _table, _table);
    execute format('create policy "%s_insert_inteligencia_360" on public.%I for insert to authenticated with check (public.can_inteligencia_360_write(auth.uid(), %L))', _table, _table, _module);
    execute format('drop policy if exists "%s_update_inteligencia_360" on public.%I', _table, _table);
    execute format('create policy "%s_update_inteligencia_360" on public.%I for update to authenticated using (public.can_inteligencia_360_write(auth.uid(), %L)) with check (public.can_inteligencia_360_write(auth.uid(), %L))', _table, _table, _module, _module);
  end loop;
end
$$;

insert into public.inteligencia_360_settings (id, monthly_revenue_target, weekly_revenue_target, daily_revenue_target, general_average_ticket_target, area_owners)
values (
  true,
  450000,
  112500,
  22500,
  12000,
  '{"financeiro":"Gestor Financeiro","comercial":"Secretario-vendedor","medico":"Dr. Daniel","recepcao":"Recepcao","enfermagem":"Enfermagem","concierge":"Concierge","administrativo":"Administrativo","gestao":"Gestao"}'::jsonb
)
on conflict (id) do nothing;
