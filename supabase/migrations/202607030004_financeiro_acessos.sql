-- Financeiro 360 — acessos refinados (decisão de 03/07/2026):
-- total: dr_daniel, ceo (Andrya), gestor_financeiro (Lucas);
-- gestor: somente leitura do financeiro; recepcionista: lança comandas.

create or replace function public.is_financeiro_full(_auth_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.colaborador c
    join public.colaborador_cargo cc on cc.colaborador_id = c.id
    where c.ativo = true
      and coalesce(cc.auth_id, c.auth_id) = _auth_id
      and cc.cargo in ('dr_daniel', 'ceo', 'gestor_financeiro')
  );
$$;

grant execute on function public.is_financeiro_full(uuid) to authenticated;

-- Comandas: leitura para coordenação + recepção; escrita para financeiro total + recepção.
drop policy if exists "fin_sales_all" on public.fin_sales;
create policy "fin_sales_select" on public.fin_sales for select to authenticated
using (public.is_coordenacao(auth.uid()) or public.can_comprovantes(auth.uid()));
create policy "fin_sales_write" on public.fin_sales for insert to authenticated
with check (public.is_financeiro_full(auth.uid()) or public.can_comprovantes(auth.uid()));
create policy "fin_sales_update" on public.fin_sales for update to authenticated
using (public.is_financeiro_full(auth.uid()) or public.can_comprovantes(auth.uid()))
with check (public.is_financeiro_full(auth.uid()) or public.can_comprovantes(auth.uid()));

drop policy if exists "fin_sale_items_all" on public.fin_sale_items;
create policy "fin_sale_items_select" on public.fin_sale_items for select to authenticated
using (public.is_coordenacao(auth.uid()) or public.can_comprovantes(auth.uid()));
create policy "fin_sale_items_write" on public.fin_sale_items for all to authenticated
using (public.is_financeiro_full(auth.uid()) or public.can_comprovantes(auth.uid()))
with check (public.is_financeiro_full(auth.uid()) or public.can_comprovantes(auth.uid()));

drop policy if exists "fin_sale_payments_all" on public.fin_sale_payments;
create policy "fin_sale_payments_select" on public.fin_sale_payments for select to authenticated
using (public.is_coordenacao(auth.uid()) or public.can_comprovantes(auth.uid()));
create policy "fin_sale_payments_write" on public.fin_sale_payments for all to authenticated
using (public.is_financeiro_full(auth.uid()) or public.can_comprovantes(auth.uid()))
with check (public.is_financeiro_full(auth.uid()) or public.can_comprovantes(auth.uid()));

-- Demais tabelas do financeiro: coordenação lê (gestor visualiza), só financeiro total escreve.
drop policy if exists "fin_expenses_all" on public.fin_expenses;
create policy "fin_expenses_select" on public.fin_expenses for select to authenticated
using (public.is_coordenacao(auth.uid()));
create policy "fin_expenses_write" on public.fin_expenses for all to authenticated
using (public.is_financeiro_full(auth.uid())) with check (public.is_financeiro_full(auth.uid()));

drop policy if exists "fin_reconciliations_all" on public.fin_reconciliations;
create policy "fin_reconciliations_select" on public.fin_reconciliations for select to authenticated
using (public.is_coordenacao(auth.uid()));
create policy "fin_reconciliations_write" on public.fin_reconciliations for all to authenticated
using (public.is_financeiro_full(auth.uid())) with check (public.is_financeiro_full(auth.uid()));

drop policy if exists "fin_savings_moves_all" on public.fin_savings_moves;
create policy "fin_savings_moves_select" on public.fin_savings_moves for select to authenticated
using (public.is_coordenacao(auth.uid()));
create policy "fin_savings_moves_write" on public.fin_savings_moves for all to authenticated
using (public.is_financeiro_full(auth.uid())) with check (public.is_financeiro_full(auth.uid()));

drop policy if exists "fin_provision_rules_all" on public.fin_provision_rules;
create policy "fin_provision_rules_select" on public.fin_provision_rules for select to authenticated
using (public.is_coordenacao(auth.uid()));
create policy "fin_provision_rules_write" on public.fin_provision_rules for all to authenticated
using (public.is_financeiro_full(auth.uid())) with check (public.is_financeiro_full(auth.uid()));

drop policy if exists "fin_invoices_all" on public.fin_invoices;
create policy "fin_invoices_select" on public.fin_invoices for select to authenticated
using (public.is_coordenacao(auth.uid()));
create policy "fin_invoices_write" on public.fin_invoices for all to authenticated
using (public.is_financeiro_full(auth.uid())) with check (public.is_financeiro_full(auth.uid()));

drop policy if exists "fin_partner_entries_all" on public.fin_partner_entries;
create policy "fin_partner_entries_select" on public.fin_partner_entries for select to authenticated
using (public.is_coordenacao(auth.uid()));
create policy "fin_partner_entries_write" on public.fin_partner_entries for all to authenticated
using (public.is_financeiro_full(auth.uid())) with check (public.is_financeiro_full(auth.uid()));

-- Categorias: leitura coordenação+recepção mantida; escrita só financeiro total.
drop policy if exists "fin_categories_write" on public.fin_categories;
create policy "fin_categories_write" on public.fin_categories for all to authenticated
using (public.is_financeiro_full(auth.uid())) with check (public.is_financeiro_full(auth.uid()));
