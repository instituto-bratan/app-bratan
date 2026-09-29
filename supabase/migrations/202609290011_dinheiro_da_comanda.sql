-- DINHEIRO DA COMANDA VAI PARA O CREDIÁRIO (29/09/2026, pedido do Lucas).
--
-- "Lançar dia com a mesma regra do Kanban: a parte paga em dinheiro vai para o
-- crediário ligado ao paciente e não entra na comanda. Mas é bom deixar
-- visualmente: aparecer na comanda, só que não vai para o faturamento."
--
-- O caixa do crediário (fin_cash_entries) é só da coordenação. Quem lança o dia
-- (recepção) grava comanda, mas não gravava o dinheiro — e o Lançar Dia deixava
-- o dinheiro dentro da comanda, no faturamento, fora do cofre.
--
--  · sale_ref liga a entrada à comanda que ficou com o resto (PIX/cartão), para
--    a comanda mostrar "R$ X em dinheiro no Crediário".
--  · fin_crediario_entrada_da_comanda: quem pode lançar comanda grava SÓ
--    entrada (nunca saída), valor positivo, ligada ao paciente. A mesma chave
--    (client_ref) regrava o valor em vez de duplicar.
--  · fin_crediario_da_comanda: devolve só as entradas ligadas a paciente/comanda
--    de um dia (para a lista do Lançar Dia), sem o resto do caixa.

alter table public.fin_cash_entries add column if not exists sale_ref text;
create index if not exists fin_cash_entries_sale_ref on public.fin_cash_entries (sale_ref) where sale_ref is not null;

create or replace function public.fin_crediario_entrada_da_comanda(
  p_client_ref text, p_dia date, p_valor numeric, p_descricao text, p_contact_ref text, p_sale_ref text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_financeiro_full(auth.uid()) or public.can_comprovantes(auth.uid())) then
    raise exception 'Sem permissão para lançar dinheiro de comanda.' using errcode = '42501';
  end if;
  if p_client_ref !~ '^fcash-' then raise exception 'Chave inválida.' using errcode = '22023'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'Valor precisa ser maior que zero.' using errcode = '22023'; end if;
  if public.fin_mes_travado_para_mim(p_dia) then
    raise exception 'MES_FECHADO: o mês deste lançamento está fechado.' using errcode = 'P0001';
  end if;
  insert into public.fin_cash_entries (client_ref, entry_date, direction, description, amount, crm_contact_ref, sale_ref, created_by)
  values (p_client_ref, p_dia, 'ENTRADA', left(coalesce(p_descricao, ''), 300), round(p_valor, 2), nullif(p_contact_ref, ''), nullif(p_sale_ref, ''),
          (select c.id from public.colaborador c where c.auth_id = auth.uid() limit 1))
  on conflict (client_ref) do update
    set amount = excluded.amount, entry_date = excluded.entry_date, description = excluded.description,
        crm_contact_ref = excluded.crm_contact_ref, sale_ref = excluded.sale_ref, deleted_at = null
  where public.fin_cash_entries.direction = 'ENTRADA';
end;
$$;
revoke all on function public.fin_crediario_entrada_da_comanda(text, date, numeric, text, text, text) from public, anon;
grant execute on function public.fin_crediario_entrada_da_comanda(text, date, numeric, text, text, text) to authenticated;

create or replace function public.fin_crediario_da_comanda(p_dia date)
returns table (client_ref text, entry_date date, amount numeric, description text, crm_contact_ref text, sale_ref text)
language sql stable security definer set search_path = public as $$
  select e.client_ref, e.entry_date, e.amount, e.description, e.crm_contact_ref, e.sale_ref
  from public.fin_cash_entries e
  where (public.is_financeiro_full(auth.uid()) or public.can_comprovantes(auth.uid()))
    and e.deleted_at is null and e.direction = 'ENTRADA' and e.entry_date = p_dia
    and (e.sale_ref is not null or e.crm_contact_ref is not null)
  order by e.created_at;
$$;
revoke all on function public.fin_crediario_da_comanda(date) from public, anon;
grant execute on function public.fin_crediario_da_comanda(date) to authenticated;
