-- Controle de Compras (planilha CONTROLE DE COMPRAS): registro de compras.
-- Crédito entra na P12 pela fatura do cartão; pix/boleto/dinheiro geram
-- conta a pagar vinculada (expense_ref).
create table if not exists public.fin_purchases (
  id uuid primary key default gen_random_uuid(),
  client_ref text unique,
  purchase_date date not null,
  description text not null,
  supplier text not null default '',
  amount numeric(14,2) not null,
  method text not null,
  card text,
  installments integer not null default 1,
  nf_note text not null default '',
  delivery_eta date,
  received_at date,
  expense_ref text,
  notes text not null default '',
  created_by uuid references public.colaborador(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fin_purchases_date on public.fin_purchases(purchase_date);

drop trigger if exists trg_fin_purchases_updated_at on public.fin_purchases;
create trigger trg_fin_purchases_updated_at
before update on public.fin_purchases
for each row execute function public.set_updated_at();

alter table public.fin_purchases enable row level security;

drop policy if exists "fin_purchases_select" on public.fin_purchases;
create policy "fin_purchases_select" on public.fin_purchases for select to authenticated
using (public.is_coordenacao(auth.uid()));

drop policy if exists "fin_purchases_write" on public.fin_purchases;
create policy "fin_purchases_write" on public.fin_purchases for all to authenticated
using (public.is_financeiro_full(auth.uid()))
with check (public.is_financeiro_full(auth.uid()));
