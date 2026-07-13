-- Caixa do Crediário (dinheiro vivo): entradas e saídas manuais, separado
-- da P12 e das comandas. Coordenação inteira lança (incl. gestor Estevão).
create table if not exists public.fin_cash_entries (
  id uuid primary key default gen_random_uuid(),
  client_ref text unique,
  entry_date date not null default current_date,
  direction text not null check (direction in ('ENTRADA', 'SAIDA')),
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  created_by uuid references public.colaborador(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_fin_cash_entries_date on public.fin_cash_entries(entry_date);

alter table public.fin_cash_entries enable row level security;

drop policy if exists "fin_cash_entries_select" on public.fin_cash_entries;
create policy "fin_cash_entries_select" on public.fin_cash_entries
for select to authenticated using (public.is_coordenacao(auth.uid()));

drop policy if exists "fin_cash_entries_write" on public.fin_cash_entries;
create policy "fin_cash_entries_write" on public.fin_cash_entries
for all to authenticated using (public.is_coordenacao(auth.uid())) with check (public.is_coordenacao(auth.uid()));
