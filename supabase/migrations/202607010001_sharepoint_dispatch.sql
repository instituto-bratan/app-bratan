create table if not exists public.sharepoint_dispatch_queue (
  id uuid primary key default gen_random_uuid(),
  module text not null default 'COMPROVANTE',
  entity_id text not null default '',
  storage_bucket text not null default 'comprovantes',
  storage_path text not null,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  target_folder text not null,
  status text not null default 'PENDING',
  attempts integer not null default 0,
  last_error text not null default '',
  sharepoint_item_id text not null default '',
  sharepoint_web_url text not null default '',
  sent_at timestamptz,
  created_by uuid references public.colaborador(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sharepoint_dispatch_queue_module check (module in ('COMPROVANTE', 'ESTORNO', 'CRM_DOCUMENTO', 'POP', 'RELATORIO_360', 'OUTRO')),
  constraint sharepoint_dispatch_queue_status check (status in ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED')),
  constraint sharepoint_dispatch_queue_attempts check (attempts >= 0)
);

create index if not exists idx_sharepoint_dispatch_queue_status
on public.sharepoint_dispatch_queue(status, created_at);

create index if not exists idx_sharepoint_dispatch_queue_entity
on public.sharepoint_dispatch_queue(module, entity_id);

drop trigger if exists trg_sharepoint_dispatch_queue_updated_at on public.sharepoint_dispatch_queue;
create trigger trg_sharepoint_dispatch_queue_updated_at
before update on public.sharepoint_dispatch_queue
for each row
execute function public.set_updated_at();

alter table public.sharepoint_dispatch_queue enable row level security;

drop policy if exists "sharepoint_dispatch_queue_select" on public.sharepoint_dispatch_queue;
create policy "sharepoint_dispatch_queue_select"
on public.sharepoint_dispatch_queue
for select to authenticated
using (public.can_comprovantes(auth.uid()) or public.is_coordenacao(auth.uid()));

drop policy if exists "sharepoint_dispatch_queue_insert" on public.sharepoint_dispatch_queue;
create policy "sharepoint_dispatch_queue_insert"
on public.sharepoint_dispatch_queue
for insert to authenticated
with check (public.can_comprovantes(auth.uid()) or public.is_coordenacao(auth.uid()));

drop policy if exists "sharepoint_dispatch_queue_update" on public.sharepoint_dispatch_queue;
create policy "sharepoint_dispatch_queue_update"
on public.sharepoint_dispatch_queue
for update to authenticated
using (public.is_coordenacao(auth.uid()))
with check (public.is_coordenacao(auth.uid()));
