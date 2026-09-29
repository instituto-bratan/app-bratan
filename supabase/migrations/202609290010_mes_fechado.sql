-- TRAVA DE MÊS FECHADO (29/09/2026, auditoria: "comanda de mês fechado é editável").
--
-- Por quê: depois que o mês foi apresentado e mandado para a contabilidade,
-- qualquer pessoa com acesso ao Lançar Dia ainda conseguia mudar valor, item ou
-- forma de pagamento de uma comanda daquele mês — e o número da reunião deixava
-- de bater com o que o contador recebeu, sem ninguém saber.
--
-- Como funciona:
--   · fin_mes_fechado guarda os meses fechados. Nada muda até alguém fechar um
--     mês: hoje a tabela nasce vazia.
--   · Só a gestão financeira (is_financeiro_full: Dr. Daniel, CEO, gestor
--     financeiro) fecha e reabre, e continua podendo corrigir um mês fechado —
--     a trava é para o resto da equipe.
--   · As Edge Functions (chave de serviço, sem auth.uid()) não são travadas: a
--     nota fiscal e os arquivos do SharePoint continuam gravando.
--   · Continuam livres em mês fechado: anexar comprovante ao pagamento e ligar
--     a comanda ao paciente do CRM / responder "aguardando explicação". Isso não
--     muda número nenhum.

create table if not exists public.fin_mes_fechado (
  mes text primary key check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  fechado_em timestamptz not null default now(),
  fechado_por uuid,
  observacao text
);
alter table public.fin_mes_fechado enable row level security;
drop policy if exists fin_mes_fechado_select on public.fin_mes_fechado;
create policy fin_mes_fechado_select on public.fin_mes_fechado for select to authenticated using (true);
revoke insert, update, delete on public.fin_mes_fechado from anon, authenticated;
grant select on public.fin_mes_fechado to authenticated;

create or replace function public.fin_fechar_mes(p_mes text, p_fechar boolean, p_observacao text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_financeiro_full(auth.uid()) then
    raise exception 'Só a gestão financeira fecha ou reabre o mês.' using errcode = '42501';
  end if;
  if p_fechar then
    insert into public.fin_mes_fechado (mes, fechado_por, observacao) values (p_mes, auth.uid(), p_observacao)
    on conflict (mes) do update set fechado_em = now(), fechado_por = excluded.fechado_por, observacao = excluded.observacao;
  else
    delete from public.fin_mes_fechado where mes = p_mes;
  end if;
end;
$$;
revoke all on function public.fin_fechar_mes(text, boolean, text) from public, anon;
grant execute on function public.fin_fechar_mes(text, boolean, text) to authenticated;

-- Quem está chamando pode mexer neste mês?
create or replace function public.fin_mes_travado_para_mim(p_dia date)
returns boolean language sql stable security definer set search_path = public as $$
  select p_dia is not null
     and auth.uid() is not null
     and exists (select 1 from public.fin_mes_fechado f where f.mes = to_char(p_dia, 'YYYY-MM'))
     and not public.is_financeiro_full(auth.uid());
$$;
revoke all on function public.fin_mes_travado_para_mim(date) from public, anon;
grant execute on function public.fin_mes_travado_para_mim(date) to authenticated;

create or replace function public.fin_trava_mes_fechado_venda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    -- Mudou só o que não mexe em número? Passa.
    if (to_jsonb(new) - array['crm_contact_ref', 'aguardando_explicacao', 'updated_at'])
       = (to_jsonb(old) - array['crm_contact_ref', 'aguardando_explicacao', 'updated_at']) then
      return new;
    end if;
  end if;
  if (tg_op in ('UPDATE', 'DELETE') and public.fin_mes_travado_para_mim(old.sale_date))
     or (tg_op in ('INSERT', 'UPDATE') and public.fin_mes_travado_para_mim(new.sale_date)) then
    raise exception 'MES_FECHADO: o mês desta comanda está fechado. Peça para a gestão financeira corrigir ou reabrir o mês.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.fin_trava_mes_fechado_filho()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_dia date;
begin
  if tg_op = 'UPDATE' and tg_table_name = 'fin_sale_payments' then
    if (to_jsonb(new) - array['comprovante_status', 'comprovante_ref']) = (to_jsonb(old) - array['comprovante_status', 'comprovante_ref']) then
      return new;
    end if;
  end if;
  select s.sale_date into v_dia from public.fin_sales s where s.client_ref = coalesce(new.sale_ref, old.sale_ref);
  if public.fin_mes_travado_para_mim(v_dia) then
    raise exception 'MES_FECHADO: o mês desta comanda está fechado. Peça para a gestão financeira corrigir ou reabrir o mês.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.sale_ref is distinct from old.sale_ref then
    select s.sale_date into v_dia from public.fin_sales s where s.client_ref = old.sale_ref;
    if public.fin_mes_travado_para_mim(v_dia) then
      raise exception 'MES_FECHADO: o mês desta comanda está fechado.' using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_fin_sales_mes_fechado on public.fin_sales;
create trigger trg_fin_sales_mes_fechado before insert or update or delete on public.fin_sales
  for each row execute function public.fin_trava_mes_fechado_venda();
drop trigger if exists trg_fin_sale_items_mes_fechado on public.fin_sale_items;
create trigger trg_fin_sale_items_mes_fechado before insert or update or delete on public.fin_sale_items
  for each row execute function public.fin_trava_mes_fechado_filho();
drop trigger if exists trg_fin_sale_payments_mes_fechado on public.fin_sale_payments;
create trigger trg_fin_sale_payments_mes_fechado before insert or update or delete on public.fin_sale_payments
  for each row execute function public.fin_trava_mes_fechado_filho();
