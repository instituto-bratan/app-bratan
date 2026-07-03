-- Financeiro 360 — Sprint 2: fechamento do dia (conciliação) e poupança/provisões.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'fin_reconciliation_status') then
    create type public.fin_reconciliation_status as enum ('PENDENTE', 'CONFERIDO', 'DIVERGENTE');
  end if;
  if not exists (select 1 from pg_type where typname = 'fin_savings_direction') then
    create type public.fin_savings_direction as enum ('ENTRADA', 'SAIDA');
  end if;
  if not exists (select 1 from pg_type where typname = 'fin_savings_source') then
    create type public.fin_savings_source as enum ('MANUAL', 'PROVISAO', 'SALDO_INICIAL');
  end if;
end $$;

create table if not exists public.fin_reconciliations (
  id uuid primary key default gen_random_uuid(),
  client_ref text not null unique,
  day date not null unique,
  expected_pix numeric(14,2) not null default 0,
  expected_card_itau numeric(14,2) not null default 0,
  expected_card_safra numeric(14,2) not null default 0,
  expected_card_outra numeric(14,2) not null default 0,
  expected_dinheiro numeric(14,2) not null default 0,
  fee_itau numeric(14,2) not null default 0,
  fee_safra numeric(14,2) not null default 0,
  status public.fin_reconciliation_status not null default 'PENDENTE',
  divergence_note text not null default '',
  confirmed_by uuid references public.colaborador(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fin_savings_moves (
  id uuid primary key default gen_random_uuid(),
  client_ref text not null unique,
  move_date date not null,
  direction public.fin_savings_direction not null,
  amount numeric(14,2) not null check (amount >= 0),
  reason text not null default '',
  source public.fin_savings_source not null default 'MANUAL',
  month_ref text not null default '',
  created_by uuid references public.colaborador(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.fin_provision_rules (
  id uuid primary key default gen_random_uuid(),
  client_ref text not null unique,
  name text not null,
  monthly_amount numeric(14,2) not null default 0,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fin_reconciliations_day on public.fin_reconciliations(day);
create index if not exists idx_fin_savings_moves_date on public.fin_savings_moves(move_date);
create index if not exists idx_fin_savings_moves_month on public.fin_savings_moves(month_ref);

drop trigger if exists trg_fin_reconciliations_updated_at on public.fin_reconciliations;
create trigger trg_fin_reconciliations_updated_at before update on public.fin_reconciliations for each row execute function public.set_updated_at();
drop trigger if exists trg_fin_savings_moves_updated_at on public.fin_savings_moves;
create trigger trg_fin_savings_moves_updated_at before update on public.fin_savings_moves for each row execute function public.set_updated_at();
drop trigger if exists trg_fin_provision_rules_updated_at on public.fin_provision_rules;
create trigger trg_fin_provision_rules_updated_at before update on public.fin_provision_rules for each row execute function public.set_updated_at();

alter table public.fin_reconciliations enable row level security;
alter table public.fin_savings_moves enable row level security;
alter table public.fin_provision_rules enable row level security;

drop policy if exists "fin_reconciliations_all" on public.fin_reconciliations;
create policy "fin_reconciliations_all" on public.fin_reconciliations for all to authenticated
using (public.is_coordenacao(auth.uid())) with check (public.is_coordenacao(auth.uid()));
drop policy if exists "fin_savings_moves_all" on public.fin_savings_moves;
create policy "fin_savings_moves_all" on public.fin_savings_moves for all to authenticated
using (public.is_coordenacao(auth.uid())) with check (public.is_coordenacao(auth.uid()));
drop policy if exists "fin_provision_rules_all" on public.fin_provision_rules;
create policy "fin_provision_rules_all" on public.fin_provision_rules for all to authenticated
using (public.is_coordenacao(auth.uid())) with check (public.is_coordenacao(auth.uid()));

-- Regras de provisão da aba "Provisionamentos 2026" da planilha de poupança.
insert into public.fin_provision_rules (client_ref, name, monthly_amount, sort_order) values
  ('prov-13-socios', '13º Sócios', 7272.00, 1),
  ('prov-13-colaboradores', '13º Colaboradores', 2063.00, 2),
  ('prov-rescisoes', 'Rescisões', 1000.00, 3),
  ('prov-ferias-colaboradores', 'Férias + 1/3 colaboradores', 2743.00, 4),
  ('prov-urgencias', 'Urgências', 500.00, 5),
  ('prov-inicio-janeiro', 'Início de ano (salários + aluguel janeiro)', 1000.00, 6),
  ('prov-festa-final-ano', 'Festa de final de ano', 909.09, 7)
on conflict (client_ref) do nothing;
