-- Financeiro 360 — Sprint 3: notas fiscais/impostos e repasses nutri/psicóloga.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'fin_invoice_type') then
    create type public.fin_invoice_type as enum ('CONSULTA', 'TRATAMENTO');
  end if;
  if not exists (select 1 from pg_type where typname = 'fin_partner_professional') then
    create type public.fin_partner_professional as enum ('NUTRICIONISTA', 'PSICOLOGA');
  end if;
  if not exists (select 1 from pg_type where typname = 'fin_partner_kind') then
    create type public.fin_partner_kind as enum ('PLANO', 'AVULSA', 'RETORNO');
  end if;
end $$;

create table if not exists public.fin_invoices (
  id uuid primary key default gen_random_uuid(),
  client_ref text not null unique,
  sale_ref text references public.fin_sales(client_ref) on delete set null,
  invoice_type public.fin_invoice_type not null,
  invoice_number text not null,
  issue_date date not null,
  comanda_date date,
  patient_name text not null default '',
  amount numeric(14,2) not null check (amount >= 0),
  notes text not null default '',
  created_by uuid references public.colaborador(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.fin_partner_entries (
  id uuid primary key default gen_random_uuid(),
  client_ref text not null unique,
  professional public.fin_partner_professional not null,
  entry_date date not null,
  patient_name text not null,
  sale_item_ref text,
  kind public.fin_partner_kind not null,
  amount numeric(14,2) not null check (amount >= 0),
  notes text not null default '',
  created_by uuid references public.colaborador(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_fin_invoices_issue on public.fin_invoices(issue_date);
create index if not exists idx_fin_invoices_sale on public.fin_invoices(sale_ref);
create index if not exists idx_fin_partner_entries_date on public.fin_partner_entries(professional, entry_date);

drop trigger if exists trg_fin_invoices_updated_at on public.fin_invoices;
create trigger trg_fin_invoices_updated_at before update on public.fin_invoices for each row execute function public.set_updated_at();
drop trigger if exists trg_fin_partner_entries_updated_at on public.fin_partner_entries;
create trigger trg_fin_partner_entries_updated_at before update on public.fin_partner_entries for each row execute function public.set_updated_at();

alter table public.fin_invoices enable row level security;
alter table public.fin_partner_entries enable row level security;

drop policy if exists "fin_invoices_all" on public.fin_invoices;
create policy "fin_invoices_all" on public.fin_invoices for all to authenticated
using (public.is_coordenacao(auth.uid())) with check (public.is_coordenacao(auth.uid()));
drop policy if exists "fin_partner_entries_all" on public.fin_partner_entries;
create policy "fin_partner_entries_all" on public.fin_partner_entries for all to authenticated
using (public.is_coordenacao(auth.uid())) with check (public.is_coordenacao(auth.uid()));
