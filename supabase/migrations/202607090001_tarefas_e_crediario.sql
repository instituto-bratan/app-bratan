-- 1. Tarefas persistentes do checklist: "até concluir" (fica todo dia até
--    alguém concluir) e "rotina" (reaparece todos os dias).
create table if not exists public.checklist_task (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  grupo text not null,
  kind text not null check (kind in ('ATE_CONCLUIR', 'ROTINA')),
  done_at timestamptz,
  active boolean not null default true,
  created_by uuid references public.colaborador(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_checklist_task_updated_at on public.checklist_task;
create trigger trg_checklist_task_updated_at
before update on public.checklist_task
for each row execute function public.set_updated_at();

alter table public.checklist_task enable row level security;
drop policy if exists "checklist_task_all" on public.checklist_task;
create policy "checklist_task_all" on public.checklist_task
for all to authenticated using (true) with check (true);

alter table public.checklist_item_run
  add column if not exists source_task_id uuid references public.checklist_task(id) on delete set null;

-- 2. Recebimentos dos lembretes (pagamentos parciais e quitações), com a
--    forma — dinheiro (crediário) ganha faturamento separado e exclusivo.
create table if not exists public.pagamento_recebimento (
  id uuid primary key default gen_random_uuid(),
  lembrete_id uuid not null references public.pagamento_lembrete(id) on delete cascade,
  valor numeric(14,2) not null,
  forma text not null default 'DINHEIRO',
  recebido_em date not null default current_date,
  recebido_por uuid references public.colaborador(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.pagamento_recebimento enable row level security;
drop policy if exists "pagamento_recebimento_select" on public.pagamento_recebimento;
create policy "pagamento_recebimento_select" on public.pagamento_recebimento
for select to authenticated using (public.is_coordenacao(auth.uid()));
drop policy if exists "pagamento_recebimento_write" on public.pagamento_recebimento;
create policy "pagamento_recebimento_write" on public.pagamento_recebimento
for insert to authenticated with check (public.is_coordenacao(auth.uid()));
