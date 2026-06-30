do $$
begin
  if not exists (select 1 from pg_type where typname = 'crm_role') then
    create type public.crm_role as enum (
      'SUPER_ADMIN',
      'ADMIN_GESTAO',
      'FINANCEIRO',
      'COMERCIAL_GESTOR',
      'COMERCIAL_VENDEDOR',
      'SDR_LEADS',
      'MEDICO',
      'RECEPCAO',
      'ENFERMAGEM',
      'CONCIERGE',
      'ADMINISTRATIVO'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_contact_type') then
    create type public.crm_contact_type as enum ('LEAD', 'PATIENT', 'FORMER_PATIENT', 'OTHER');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_lifecycle_stage') then
    create type public.crm_lifecycle_stage as enum (
      'COLD_LEAD',
      'WARM_LEAD',
      'QUALIFIED_LEAD',
      'SCHEDULED',
      'CONSULTED',
      'PRESCRIBED',
      'NEGOTIATION',
      'CLOSED_PATIENT',
      'ACTIVE_PATIENT',
      'FOLLOW_UP',
      'RESCUE',
      'CHURN',
      'INACTIVE'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_lead_temperature') then
    create type public.crm_lead_temperature as enum ('COLD', 'WARM', 'HOT');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_persona_fit') then
    create type public.crm_persona_fit as enum ('AAA', 'HIGH_TICKET', 'MEDIUM', 'LOW_FIT', 'UNKNOWN');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_task_type') then
    create type public.crm_task_type as enum ('WHATSAPP', 'CALL', 'EMAIL', 'IN_PERSON', 'INTERNAL_CHECK', 'CONTRACT', 'PAYMENT', 'SCHEDULE', 'FOLLOW_UP', 'RESCUE', 'CHURN_INVESTIGATION');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_task_status') then
    create type public.crm_task_status as enum ('PENDING', 'IN_PROGRESS', 'DONE', 'SKIPPED', 'CANCELED', 'OVERDUE');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_priority') then
    create type public.crm_priority as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_visibility_scope') then
    create type public.crm_visibility_scope as enum ('OWNER_ONLY', 'ROLE', 'MANAGEMENT', 'ALL_ALLOWED');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_generated_by') then
    create type public.crm_generated_by as enum ('MANUAL', 'CADENCE_ENGINE', 'PIPELINE_STAGE', 'INTELLIGENCE_ENGINE', 'IMPORT');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_task_result') then
    create type public.crm_task_result as enum ('RESPONDED', 'NO_RESPONSE', 'SCHEDULED', 'RESCHEDULED', 'SOLD', 'NOT_SOLD', 'SENT', 'NEEDS_MANAGER', 'OTHER');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_deal_type') then
    create type public.crm_deal_type as enum ('FIRST_CONSULTATION', 'TREATMENT_PLAN', 'RENEWAL', 'RESCUE', 'UPSELL', 'CROSS_SELL');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_deal_stage') then
    create type public.crm_deal_stage as enum (
      'LEAD_FRIO',
      'LEAD_NOVO',
      'CONTATADO',
      'QUALIFICADO',
      'CONSULTA_AGENDADA',
      'CONSULTA_CONFIRMADA',
      'CONSULTA_REALIZADA',
      'PRESCRICAO_FEITA',
      'EM_NEGOCIACAO',
      'FECHOU_COMPLETO',
      'FECHOU_PARCIAL',
      'NAO_FECHOU',
      'RECUPERACAO_D1_MEDICO',
      'RECUPERACAO_D2_GESTOR',
      'PERDIDO',
      'RESGATE_D60'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_deal_status') then
    create type public.crm_deal_status as enum ('OPEN', 'WON_FULL', 'WON_PARTIAL', 'LOST', 'PAUSED');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_objection_category') then
    create type public.crm_objection_category as enum ('PRICE', 'TRUST', 'TIMING', 'SPOUSE_OR_FAMILY', 'PAYMENT_METHOD', 'NEEDS_MORE_INFORMATION', 'NO_PERCEIVED_VALUE', 'NO_RESPONSE', 'OTHER');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_cadence_type') then
    create type public.crm_cadence_type as enum (
      'COLD_LEAD',
      'COMMERCIAL_FOLLOW_UP',
      'POST_CONSULTATION_NOT_CLOSED',
      'POST_SALE_CONCIERGE',
      'NURSING_14_DAYS',
      'POST_APPLICATION_NURSING',
      'MONTHLY_CHECKPOINT',
      'RETURN_CYCLE',
      'RESCUE_60_DAYS',
      'GOOGLE_REVIEW'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_cadence_status') then
    create type public.crm_cadence_status as enum ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELED');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_offset_type') then
    create type public.crm_offset_type as enum ('DAYS_AFTER_TRIGGER', 'BEFORE_EVENT_DATE', 'AFTER_EVENT_DATE', 'RECURRING_EVERY_X_DAYS', 'RECURRING_EVERY_X_MONTHS');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_time_window') then
    create type public.crm_time_window as enum ('MORNING', 'AFTERNOON', 'EVENING', 'ANY');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_channel') then
    create type public.crm_channel as enum ('WHATSAPP', 'CALL', 'EMAIL', 'IN_PERSON', 'INTERNAL');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_sentiment') then
    create type public.crm_sentiment as enum ('POSITIVE', 'NEUTRAL', 'NEGATIVE', 'NO_RESPONSE');
  end if;
end
$$;

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
    when 'nutricionista' then 'ENFERMAGEM'::public.crm_role
    else null
  end
  from public.colaborador c
  join public.colaborador_cargo cc on cc.colaborador_id = c.id
  where c.ativo = true
    and coalesce(cc.auth_id, c.auth_id) = _user
  limit 1
$$;

create or replace function public.can_crm_read(_user uuid)
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
      and cc.cargo <> 'limpeza'
  )
$$;

create or replace function public.can_crm_manage(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_coordenacao(_user) or public.has_cargo(_user, 'gestor_financeiro')
$$;

create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  client_ref text not null unique,
  contact_type public.crm_contact_type not null default 'LEAD',
  lifecycle_stage public.crm_lifecycle_stage not null default 'COLD_LEAD',
  full_name text not null,
  preferred_name text,
  phone text,
  whatsapp text,
  email text,
  instagram text,
  source_channel text,
  acquisition_campaign text,
  lead_temperature public.crm_lead_temperature not null default 'WARM',
  persona_fit public.crm_persona_fit not null default 'UNKNOWN',
  main_pain text,
  main_goal text,
  owner_user_id text,
  commercial_owner_id text,
  concierge_owner_id text,
  nurse_owner_id text,
  doctor_id text,
  notes text,
  opt_out boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.crm_deals (
  id uuid primary key default gen_random_uuid(),
  client_ref text not null unique,
  contact_id text not null references public.crm_contacts(client_ref) on delete cascade,
  title text not null,
  deal_type public.crm_deal_type not null default 'FIRST_CONSULTATION',
  stage public.crm_deal_stage not null default 'LEAD_NOVO',
  estimated_value numeric(14,2) not null default 0,
  prescribed_amount numeric(14,2) not null default 0,
  sold_amount numeric(14,2) not null default 0,
  received_amount numeric(14,2) not null default 0,
  probability integer not null default 0 check (probability >= 0 and probability <= 100),
  status public.crm_deal_status not null default 'OPEN',
  main_objection text,
  objection_category public.crm_objection_category not null default 'OTHER',
  source_channel text,
  owner_user_id text,
  doctor_id text,
  expected_close_date date,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_cadences (
  id uuid primary key default gen_random_uuid(),
  client_ref text not null unique,
  name text not null,
  description text,
  cadence_type public.crm_cadence_type not null,
  default_owner_role public.crm_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_cadence_steps (
  id uuid primary key default gen_random_uuid(),
  client_ref text not null unique,
  cadence_id text not null references public.crm_cadences(client_ref) on delete cascade,
  step_order integer not null,
  name text not null,
  offset_type public.crm_offset_type not null,
  offset_value integer not null default 0,
  preferred_time_window public.crm_time_window not null default 'ANY',
  task_type public.crm_task_type not null default 'WHATSAPP',
  assigned_to_role public.crm_role not null,
  message_template_id text,
  required boolean not null default true,
  pause_if_contact_responded boolean not null default true,
  cancel_if_stage_changed boolean not null default true,
  active boolean not null default true
);

create table if not exists public.crm_cadence_enrollments (
  id uuid primary key default gen_random_uuid(),
  client_ref text not null unique,
  cadence_id text not null references public.crm_cadences(client_ref) on delete cascade,
  contact_id text not null references public.crm_contacts(client_ref) on delete cascade,
  deal_id text,
  status public.crm_cadence_status not null default 'ACTIVE',
  enrolled_at timestamptz not null default now(),
  trigger_source text,
  trigger_date date not null default current_date,
  owner_user_id text,
  owner_role public.crm_role not null,
  completed_at timestamptz,
  canceled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_message_templates (
  id uuid primary key default gen_random_uuid(),
  client_ref text not null unique,
  name text not null,
  category text,
  role_owner public.crm_role not null,
  cadence_type public.crm_cadence_type not null,
  channel public.crm_channel not null default 'WHATSAPP',
  body text not null,
  variables_json jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  client_ref text not null unique,
  contact_id text references public.crm_contacts(client_ref) on delete cascade,
  deal_id text,
  cadence_id text,
  cadence_step_id text,
  title text not null,
  description text,
  task_type public.crm_task_type not null,
  assigned_to_user_id text,
  assigned_to_role public.crm_role not null,
  due_at timestamptz not null,
  completed_at timestamptz,
  status public.crm_task_status not null default 'PENDING',
  priority public.crm_priority not null default 'MEDIUM',
  visibility_scope public.crm_visibility_scope not null default 'ROLE',
  generated_by public.crm_generated_by not null default 'MANUAL',
  result public.crm_task_result,
  result_notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_touchpoints (
  id uuid primary key default gen_random_uuid(),
  client_ref text not null unique,
  contact_id text not null references public.crm_contacts(client_ref) on delete cascade,
  task_id text,
  cadence_id text,
  touch_type public.crm_task_type not null,
  channel public.crm_channel not null,
  sent_by_user_id text,
  sent_at timestamptz not null default now(),
  response_received boolean not null default false,
  response_at timestamptz,
  response_summary text,
  sentiment public.crm_sentiment not null default 'NEUTRAL',
  created_at timestamptz not null default now()
);

create table if not exists public.crm_timeline_events (
  id uuid primary key default gen_random_uuid(),
  client_ref text not null unique,
  contact_id text not null references public.crm_contacts(client_ref) on delete cascade,
  event_type text not null,
  event_title text not null,
  event_description text,
  source_module text not null,
  source_id text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_crm_contacts_lifecycle on public.crm_contacts(lifecycle_stage);
create index if not exists idx_crm_contacts_phone on public.crm_contacts(phone);
create index if not exists idx_crm_contacts_whatsapp on public.crm_contacts(whatsapp);
create index if not exists idx_crm_deals_contact on public.crm_deals(contact_id);
create index if not exists idx_crm_deals_stage on public.crm_deals(stage);
create index if not exists idx_crm_tasks_contact on public.crm_tasks(contact_id);
create index if not exists idx_crm_tasks_due on public.crm_tasks(due_at);
create index if not exists idx_crm_tasks_role_status on public.crm_tasks(assigned_to_role, status);
create index if not exists idx_crm_enrollments_contact on public.crm_cadence_enrollments(contact_id);
create index if not exists idx_crm_touchpoints_contact_sent on public.crm_touchpoints(contact_id, sent_at desc);
create index if not exists idx_crm_timeline_contact_date on public.crm_timeline_events(contact_id, created_at desc);

drop trigger if exists trg_crm_contacts_updated_at on public.crm_contacts;
create trigger trg_crm_contacts_updated_at before update on public.crm_contacts for each row execute function public.set_updated_at();
drop trigger if exists trg_crm_deals_updated_at on public.crm_deals;
create trigger trg_crm_deals_updated_at before update on public.crm_deals for each row execute function public.set_updated_at();
drop trigger if exists trg_crm_cadences_updated_at on public.crm_cadences;
create trigger trg_crm_cadences_updated_at before update on public.crm_cadences for each row execute function public.set_updated_at();
drop trigger if exists trg_crm_cadence_enrollments_updated_at on public.crm_cadence_enrollments;
create trigger trg_crm_cadence_enrollments_updated_at before update on public.crm_cadence_enrollments for each row execute function public.set_updated_at();
drop trigger if exists trg_crm_message_templates_updated_at on public.crm_message_templates;
create trigger trg_crm_message_templates_updated_at before update on public.crm_message_templates for each row execute function public.set_updated_at();
drop trigger if exists trg_crm_tasks_updated_at on public.crm_tasks;
create trigger trg_crm_tasks_updated_at before update on public.crm_tasks for each row execute function public.set_updated_at();

alter table public.crm_contacts enable row level security;
alter table public.crm_deals enable row level security;
alter table public.crm_cadences enable row level security;
alter table public.crm_cadence_steps enable row level security;
alter table public.crm_cadence_enrollments enable row level security;
alter table public.crm_message_templates enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.crm_touchpoints enable row level security;
alter table public.crm_timeline_events enable row level security;

drop policy if exists "crm_contacts_select" on public.crm_contacts;
create policy "crm_contacts_select" on public.crm_contacts for select to authenticated using (public.can_crm_read(auth.uid()));
drop policy if exists "crm_contacts_write" on public.crm_contacts;
create policy "crm_contacts_write" on public.crm_contacts for all to authenticated using (public.can_crm_read(auth.uid())) with check (public.can_crm_read(auth.uid()));

drop policy if exists "crm_deals_select" on public.crm_deals;
create policy "crm_deals_select" on public.crm_deals for select to authenticated using (public.can_crm_read(auth.uid()));
drop policy if exists "crm_deals_write" on public.crm_deals;
create policy "crm_deals_write" on public.crm_deals for all to authenticated using (public.can_crm_read(auth.uid())) with check (public.can_crm_read(auth.uid()));

drop policy if exists "crm_cadences_select" on public.crm_cadences;
create policy "crm_cadences_select" on public.crm_cadences for select to authenticated using (public.can_crm_read(auth.uid()));
drop policy if exists "crm_cadences_manage" on public.crm_cadences;
create policy "crm_cadences_manage" on public.crm_cadences for all to authenticated using (public.can_crm_manage(auth.uid())) with check (public.can_crm_manage(auth.uid()));

drop policy if exists "crm_cadence_steps_select" on public.crm_cadence_steps;
create policy "crm_cadence_steps_select" on public.crm_cadence_steps for select to authenticated using (public.can_crm_read(auth.uid()));
drop policy if exists "crm_cadence_steps_manage" on public.crm_cadence_steps;
create policy "crm_cadence_steps_manage" on public.crm_cadence_steps for all to authenticated using (public.can_crm_manage(auth.uid())) with check (public.can_crm_manage(auth.uid()));

drop policy if exists "crm_cadence_enrollments_select" on public.crm_cadence_enrollments;
create policy "crm_cadence_enrollments_select" on public.crm_cadence_enrollments for select to authenticated using (public.can_crm_read(auth.uid()));
drop policy if exists "crm_cadence_enrollments_write" on public.crm_cadence_enrollments;
create policy "crm_cadence_enrollments_write" on public.crm_cadence_enrollments for all to authenticated using (public.can_crm_read(auth.uid())) with check (public.can_crm_read(auth.uid()));

drop policy if exists "crm_message_templates_select" on public.crm_message_templates;
create policy "crm_message_templates_select" on public.crm_message_templates for select to authenticated using (public.can_crm_read(auth.uid()));
drop policy if exists "crm_message_templates_manage" on public.crm_message_templates;
create policy "crm_message_templates_manage" on public.crm_message_templates for all to authenticated using (public.can_crm_manage(auth.uid())) with check (public.can_crm_manage(auth.uid()));

drop policy if exists "crm_tasks_select" on public.crm_tasks;
create policy "crm_tasks_select" on public.crm_tasks
for select
to authenticated
using (
  public.can_crm_manage(auth.uid())
  or visibility_scope = 'ALL_ALLOWED'
  or assigned_to_role = public.crm_user_role(auth.uid())
  or assigned_to_user_id in (
    select c.id::text
    from public.colaborador c
    join public.colaborador_cargo cc on cc.colaborador_id = c.id
    where c.ativo = true and coalesce(cc.auth_id, c.auth_id) = auth.uid()
  )
);
drop policy if exists "crm_tasks_write" on public.crm_tasks;
create policy "crm_tasks_write" on public.crm_tasks for all to authenticated using (public.can_crm_read(auth.uid())) with check (public.can_crm_read(auth.uid()));

drop policy if exists "crm_touchpoints_select" on public.crm_touchpoints;
create policy "crm_touchpoints_select" on public.crm_touchpoints for select to authenticated using (public.can_crm_read(auth.uid()));
drop policy if exists "crm_touchpoints_write" on public.crm_touchpoints;
create policy "crm_touchpoints_write" on public.crm_touchpoints for all to authenticated using (public.can_crm_read(auth.uid())) with check (public.can_crm_read(auth.uid()));

drop policy if exists "crm_timeline_events_select" on public.crm_timeline_events;
create policy "crm_timeline_events_select" on public.crm_timeline_events for select to authenticated using (public.can_crm_read(auth.uid()));
drop policy if exists "crm_timeline_events_write" on public.crm_timeline_events;
create policy "crm_timeline_events_write" on public.crm_timeline_events for all to authenticated using (public.can_crm_read(auth.uid())) with check (public.can_crm_read(auth.uid()));
