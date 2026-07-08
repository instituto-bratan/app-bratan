-- PDCA: marcação manual de não adesão (com objeção). O resto é derivado:
-- tratamento/sinal na comanda = aderiu; tratamento depois = aderiu depois;
-- sem marcação = em decisão.
create table if not exists public.fin_pdca_status (
  sale_ref text primary key,
  status text not null,
  objection text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.fin_pdca_status enable row level security;

drop policy if exists "fin_pdca_status_select" on public.fin_pdca_status;
create policy "fin_pdca_status_select" on public.fin_pdca_status for select to authenticated
using (public.is_coordenacao(auth.uid()));

drop policy if exists "fin_pdca_status_write" on public.fin_pdca_status;
create policy "fin_pdca_status_write" on public.fin_pdca_status for all to authenticated
using (public.is_financeiro_full(auth.uid()))
with check (public.is_financeiro_full(auth.uid()));
