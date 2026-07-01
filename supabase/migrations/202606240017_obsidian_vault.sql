create table if not exists public.obsidian_vault_settings (
  id boolean primary key default true,
  obsidian_enabled boolean not null default false,
  obsidian_vault_path text not null default '',
  sync_mode text not null default 'MANUAL',
  export_sensitive_data boolean not null default false,
  export_financial_values boolean not null default false,
  export_patient_names boolean not null default true,
  export_contact_phone boolean not null default false,
  default_redaction_mode text not null default 'PARTIAL',
  last_sync_at timestamptz,
  last_sync_status text not null default 'awaiting_config',
  last_sync_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint obsidian_vault_settings_singleton check (id = true),
  constraint obsidian_vault_settings_sync_mode check (sync_mode in ('MANUAL', 'AUTO_DAILY', 'AUTO_WEEKLY', 'ON_DEMAND')),
  constraint obsidian_vault_settings_redaction check (default_redaction_mode in ('NONE', 'PARTIAL', 'STRICT')),
  constraint obsidian_vault_settings_status check (last_sync_status in ('connected', 'no_permission', 'invalid_path', 'awaiting_config', 'success', 'failed'))
);

create table if not exists public.obsidian_export_queue (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  export_type text not null,
  target_path text not null,
  status text not null default 'PENDING',
  error_message text not null default '',
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint obsidian_export_queue_entity_type check (entity_type in ('DASHBOARD_SNAPSHOT', 'CRM_CONTACT', 'CRM_DEAL', 'CRM_TASK', 'CADENCE', 'TEMPLATE', 'REPORT', 'PLAYBOOK', 'AUDIT')),
  constraint obsidian_export_queue_export_type check (export_type in ('CREATE', 'UPDATE', 'DELETE', 'SNAPSHOT')),
  constraint obsidian_export_queue_status check (status in ('PENDING', 'PROCESSING', 'DONE', 'FAILED', 'SKIPPED')),
  constraint obsidian_export_queue_attempts check (attempts >= 0)
);

create table if not exists public.obsidian_sync_logs (
  id uuid primary key default gen_random_uuid(),
  sync_type text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  files_created integer not null default 0,
  files_updated integer not null default 0,
  files_failed integer not null default 0,
  error_message text not null default '',
  triggered_by_user_id uuid references public.colaborador(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint obsidian_sync_logs_status check (status in ('DONE', 'FAILED', 'SKIPPED')),
  constraint obsidian_sync_logs_counts check (files_created >= 0 and files_updated >= 0 and files_failed >= 0)
);

create index if not exists idx_obsidian_export_queue_status
on public.obsidian_export_queue(status, created_at desc);

create index if not exists idx_obsidian_export_queue_entity
on public.obsidian_export_queue(entity_type, entity_id);

create index if not exists idx_obsidian_sync_logs_created_at
on public.obsidian_sync_logs(created_at desc);

drop trigger if exists trg_obsidian_vault_settings_updated_at on public.obsidian_vault_settings;
create trigger trg_obsidian_vault_settings_updated_at
before update on public.obsidian_vault_settings
for each row
execute function public.set_updated_at();

drop trigger if exists trg_obsidian_export_queue_updated_at on public.obsidian_export_queue;
create trigger trg_obsidian_export_queue_updated_at
before update on public.obsidian_export_queue
for each row
execute function public.set_updated_at();

alter table public.obsidian_vault_settings enable row level security;
alter table public.obsidian_export_queue enable row level security;
alter table public.obsidian_sync_logs enable row level security;

drop policy if exists "obsidian_vault_settings_select" on public.obsidian_vault_settings;
create policy "obsidian_vault_settings_select"
on public.obsidian_vault_settings
for select to authenticated
using (public.is_coordenacao(auth.uid()));

drop policy if exists "obsidian_vault_settings_write" on public.obsidian_vault_settings;
create policy "obsidian_vault_settings_write"
on public.obsidian_vault_settings
for all to authenticated
using (public.is_coordenacao(auth.uid()))
with check (public.is_coordenacao(auth.uid()));

drop policy if exists "obsidian_export_queue_select" on public.obsidian_export_queue;
create policy "obsidian_export_queue_select"
on public.obsidian_export_queue
for select to authenticated
using (public.is_coordenacao(auth.uid()));

drop policy if exists "obsidian_export_queue_write" on public.obsidian_export_queue;
create policy "obsidian_export_queue_write"
on public.obsidian_export_queue
for all to authenticated
using (public.is_coordenacao(auth.uid()))
with check (public.is_coordenacao(auth.uid()));

drop policy if exists "obsidian_sync_logs_select" on public.obsidian_sync_logs;
create policy "obsidian_sync_logs_select"
on public.obsidian_sync_logs
for select to authenticated
using (public.is_coordenacao(auth.uid()));

drop policy if exists "obsidian_sync_logs_insert" on public.obsidian_sync_logs;
create policy "obsidian_sync_logs_insert"
on public.obsidian_sync_logs
for insert to authenticated
with check (public.is_coordenacao(auth.uid()));

insert into public.obsidian_vault_settings (id)
values (true)
on conflict (id) do nothing;
