-- FATURA DO CARTÃO IMPORTADA (29/09/2026) — aprovada pelo Lucas.
--
-- Até aqui cada fatura do Itaú (VISA da obra e Mastercard) era UMA conta a
-- pagar só com o total, na categoria cat-fatura-cartao-credito: ninguém sabia o
-- que tinha dentro, as compras de cartão da tela Compras nunca eram conferidas
-- contra a fatura, já houve fatura lançada em dobro (uma de 28.000 teve de ser
-- excluída) e estimativas que não batiam com o boleto real.
--
-- O QUE ESTA MIGRATION CRIA
--   fin_fatura_cartao       — uma linha por fatura importada (cartão + mês de
--                             vencimento), ligada à conta a pagar que ela virou.
--   fin_fatura_cartao_item  — as linhas da fatura: data, estabelecimento,
--                             parcela, valor, categoria e a compra de Compras
--                             com que casou.
--   fin_fatura_confirmar()  — grava tudo de uma vez (conta + fatura + itens):
--                             ou entra inteiro, ou nada entra.
--   fin_fatura_desfazer()   — tira a importação (a conta a pagar fica).
--   fin_fatura_rateio()     — soma dos itens por categoria de cada conta de
--                             fatura, para a P12/Painel/Lucro.
--
-- NÃO CONTAR EM DOBRO: a conta da fatura continua sendo a despesa (é o
-- pagamento). Os itens NÃO viram contas: quem lê despesa por categoria troca a
-- conta pelos pedaços do rateio (src/features/financeiro/faturaCartao.ts,
-- explodirContasDeFatura). A soma dos pedaços é sempre o valor da conta.
--
-- TRAVAS (repetidas na tela, em travaDeImportacao):
--   1. o mesmo cartão no mesmo mês só entra uma vez;
--   2. o mesmo conteúdo (assinatura das linhas + total) só entra uma vez;
--   3. uma conta a pagar só se liga a uma fatura;
--   4. a mesma parcela da mesma compra só casa com uma linha, em qualquer fatura.
--
-- ACESSO: só o financeiro completo (is_financeiro_full: Lucas, Dr. Daniel e CEO)
-- lê e grava linha a linha — ou quem a tela Acessos liberar na tela
-- "fin-fatura" (VER lê; gravar continua exigindo o financeiro completo, porque
-- a gravação mexe em fin_expenses, que só ele grava). O rateio por categoria
-- (sem nome de estabelecimento) sai para quem já vê a P12, pela função
-- fin_fatura_rateio, para a P12 dar o mesmo número para todo mundo.
--
-- Valores novos conferidos no banco em 29/09/2026: categorias usadas existem em
-- fin_categories (FK), fin_expenses.method é o enum fin_payment_method e já tem
-- 'BOLETO', nota_status aceita 'SEM_NOTA'. Nenhum enum/CHECK existente muda.

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table if not exists public.fin_fatura_cartao (
  id uuid primary key default gen_random_uuid(),
  client_ref text not null unique,
  cartao text not null check (cartao in ('ITAU_VISA', 'ITAU_MASTER')),
  -- Só os 4 finais. O número inteiro do cartão nunca entra no banco.
  final_cartao text not null default '' check (final_cartao ~ '^([0-9]{4})?$'),
  mes_ref text not null check (mes_ref ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  vencimento date not null,
  fechamento date,
  total numeric(12, 2) not null check (total > 0),
  soma_linhas numeric(12, 2) not null,
  expense_ref text not null references public.fin_expenses (client_ref),
  conta_acao text not null check (conta_acao in ('CRIADA', 'ATUALIZADA')),
  -- Quanto a conta dizia antes (a estimativa), para a história ficar contada.
  valor_anterior numeric(12, 2),
  vencimento_anterior date,
  assinatura text not null,
  arquivo_nome text not null default '',
  arquivo_formato text not null default '' check (arquivo_formato in ('', 'XLSX', 'CSV', 'OFX', 'PDF', 'TEXTO')),
  observacao text not null default '',
  created_by uuid references public.colaborador (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.colaborador (id) on delete set null
);

comment on table public.fin_fatura_cartao is
  'Fatura do cartão importada (29/09/2026): cartão + mês do vencimento, ligada à conta a pagar (expense_ref) que é o pagamento. Os itens explicam o gasto; não viram contas.';

create unique index if not exists fin_fatura_cartao_mes_uidx
  on public.fin_fatura_cartao (cartao, mes_ref) where deleted_at is null;
create unique index if not exists fin_fatura_cartao_assinatura_uidx
  on public.fin_fatura_cartao (assinatura) where deleted_at is null;
create unique index if not exists fin_fatura_cartao_conta_uidx
  on public.fin_fatura_cartao (expense_ref) where deleted_at is null;
create index if not exists fin_fatura_cartao_venc_idx
  on public.fin_fatura_cartao (vencimento desc);

create table if not exists public.fin_fatura_cartao_item (
  id uuid primary key default gen_random_uuid(),
  client_ref text not null unique,
  fatura_ref text not null references public.fin_fatura_cartao (client_ref) on delete cascade,
  ordem integer not null check (ordem >= 1),
  data_compra date,
  descricao text not null,
  parcela_num integer check (parcela_num between 1 and 99),
  parcela_total integer check (parcela_total between 1 and 99),
  valor numeric(12, 2) not null,
  tipo text not null check (tipo in ('COMPRA', 'PARCELA', 'ESTORNO', 'IOF', 'ANUIDADE', 'ENCARGO', 'PAGAMENTO', 'OUTRO')),
  categoria_ref text references public.fin_categories (client_ref),
  categoria_origem text not null default 'REGRA' check (categoria_origem in ('REGRA', 'COMPRA', 'MANUAL', 'PADRAO')),
  purchase_ref text references public.fin_purchases (client_ref),
  casamento text check (casamento in ('AUTO', 'MANUAL')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (parcela_num is null or parcela_total is null or parcela_num <= parcela_total),
  check ((purchase_ref is null) = (casamento is null))
);

comment on table public.fin_fatura_cartao_item is
  'Linhas da fatura do cartão (29/09/2026). valor > 0 é gasto, < 0 é estorno/crédito; tipo PAGAMENTO (fatura anterior) fica fora do rateio.';

create index if not exists fin_fatura_cartao_item_fatura_idx on public.fin_fatura_cartao_item (fatura_ref, ordem);
-- Nunca duas linhas para a mesma compra na mesma fatura…
create unique index if not exists fin_fatura_cartao_item_compra_fatura_uidx
  on public.fin_fatura_cartao_item (fatura_ref, purchase_ref)
  where purchase_ref is not null and deleted_at is null;
-- …nem a mesma parcela da mesma compra em duas faturas.
create unique index if not exists fin_fatura_cartao_item_compra_parcela_uidx
  on public.fin_fatura_cartao_item (purchase_ref, coalesce(parcela_num, 1))
  where purchase_ref is not null and deleted_at is null;

drop trigger if exists trg_fin_fatura_cartao_updated_at on public.fin_fatura_cartao;
create trigger trg_fin_fatura_cartao_updated_at
before update on public.fin_fatura_cartao
for each row execute function public.set_updated_at();

drop trigger if exists trg_fin_fatura_cartao_item_updated_at on public.fin_fatura_cartao_item;
create trigger trg_fin_fatura_cartao_item_updated_at
before update on public.fin_fatura_cartao_item
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.fin_fatura_cartao enable row level security;
alter table public.fin_fatura_cartao_item enable row level security;

drop policy if exists "fin_fatura_cartao_select" on public.fin_fatura_cartao;
create policy "fin_fatura_cartao_select" on public.fin_fatura_cartao for select to authenticated
using (
  public.is_financeiro_full(auth.uid())
  or coalesce(public.module_access_override(auth.uid(), 'fin-fatura') in ('VER', 'EDITAR'), false)
);

drop policy if exists "fin_fatura_cartao_write" on public.fin_fatura_cartao;
create policy "fin_fatura_cartao_write" on public.fin_fatura_cartao for all to authenticated
using (public.is_financeiro_full(auth.uid()))
with check (public.is_financeiro_full(auth.uid()));

drop policy if exists "fin_fatura_cartao_item_select" on public.fin_fatura_cartao_item;
create policy "fin_fatura_cartao_item_select" on public.fin_fatura_cartao_item for select to authenticated
using (
  public.is_financeiro_full(auth.uid())
  or coalesce(public.module_access_override(auth.uid(), 'fin-fatura') in ('VER', 'EDITAR'), false)
);

drop policy if exists "fin_fatura_cartao_item_write" on public.fin_fatura_cartao_item;
create policy "fin_fatura_cartao_item_write" on public.fin_fatura_cartao_item for all to authenticated
using (public.is_financeiro_full(auth.uid()))
with check (public.is_financeiro_full(auth.uid()));

-- ---------------------------------------------------------------------------
-- Confirmar: conta + fatura + itens numa transação só
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER de propósito: roda com a RLS de quem chama (fin_expenses e
-- as tabelas novas só aceitam o financeiro completo). A função só junta as
-- gravações para que uma falha no meio não deixe fatura sem conta, conta sem
-- itens ou estimativa atualizada sem a fatura.
create or replace function public.fin_fatura_confirmar(p jsonb)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ref text := p ->> 'client_ref';
  v_cartao text := p ->> 'cartao';
  v_mes text := p ->> 'mes_ref';
  v_venc date := (p ->> 'vencimento')::date;
  v_total numeric(12, 2) := (p ->> 'total')::numeric;
  v_assinatura text := p ->> 'assinatura';
  v_conta jsonb := p -> 'conta';
  v_acao text := v_conta ->> 'acao';
  v_expense text := v_conta ->> 'client_ref';
  v_nota text := coalesce(v_conta ->> 'nota', '');
  v_anterior numeric(12, 2);
  v_venc_anterior date;
  v_autor uuid;
begin
  if not public.is_financeiro_full(auth.uid()) then
    raise exception 'SEM_PERMISSAO: só o financeiro completo (Lucas, Dr. Daniel, CEO) importa fatura.' using errcode = '42501';
  end if;
  if v_ref is null or v_cartao is null or v_mes is null or v_venc is null or v_total is null or v_assinatura is null or v_expense is null then
    raise exception 'DADOS_INCOMPLETOS: faltou cartão, mês, vencimento, total ou conta.';
  end if;
  if exists (select 1 from public.fin_fatura_cartao f where f.deleted_at is null and f.cartao = v_cartao and f.mes_ref = v_mes) then
    raise exception 'FATURA_JA_IMPORTADA: a fatura deste cartão neste mês já foi importada. Desfaça a importação antes de trocar.';
  end if;
  if exists (select 1 from public.fin_fatura_cartao f where f.deleted_at is null and f.assinatura = v_assinatura) then
    raise exception 'ARQUIVO_JA_IMPORTADO: este mesmo arquivo já foi importado como outra fatura.';
  end if;
  if exists (select 1 from public.fin_fatura_cartao f where f.deleted_at is null and f.expense_ref = v_expense) then
    raise exception 'CONTA_JA_LIGADA: esta conta a pagar já está ligada a outra fatura importada.';
  end if;

  select c.id into v_autor from public.colaborador c where c.auth_id = auth.uid() and c.ativo = true limit 1;

  if v_acao = 'ATUALIZAR' then
    -- A estimativa daquele cartão/mês ganha o valor e o vencimento do boleto real.
    select e.amount, e.due_date into v_anterior, v_venc_anterior
    from public.fin_expenses e
    where e.client_ref = v_expense and e.deleted_at is null
    for update;
    if not found then
      raise exception 'CONTA_NAO_ENCONTRADA: a conta escolhida não existe mais (foi excluída?). Recarregue a tela.';
    end if;
    update public.fin_expenses e
       set amount = v_total,
           due_date = v_venc,
           category_ref = 'cat-fatura-cartao-credito',
           notes = btrim(concat_ws(E'\n', nullif(e.notes, ''), v_nota)),
           updated_at = now()
     where e.client_ref = v_expense;
  elsif v_acao = 'CRIAR' then
    insert into public.fin_expenses (
      client_ref, description, category_ref, amount, due_date, paid_at, method, supplier,
      document_note, is_capex, notes, nota_status, created_by
    ) values (
      v_expense,
      coalesce(nullif(v_conta ->> 'description', ''), 'Fatura cartão Itaú'),
      'cat-fatura-cartao-credito',
      v_total,
      v_venc,
      null,
      'BOLETO',
      coalesce(v_conta ->> 'supplier', 'Itaú'),
      'Fatura importada linha a linha',
      false,
      v_nota,
      -- A fatura do cartão não tem nota de fornecedor (as notas são das compras).
      'SEM_NOTA',
      v_autor
    );
  else
    raise exception 'DADOS_INCOMPLETOS: diga se a conta é nova ou se atualiza a estimativa.';
  end if;

  insert into public.fin_fatura_cartao (
    client_ref, cartao, final_cartao, mes_ref, vencimento, fechamento, total, soma_linhas,
    expense_ref, conta_acao, valor_anterior, vencimento_anterior, assinatura,
    arquivo_nome, arquivo_formato, observacao, created_by
  ) values (
    v_ref, v_cartao, coalesce(p ->> 'final_cartao', ''), v_mes, v_venc, nullif(p ->> 'fechamento', '')::date,
    v_total, coalesce((p ->> 'soma_linhas')::numeric, 0),
    v_expense, case when v_acao = 'ATUALIZAR' then 'ATUALIZADA' else 'CRIADA' end,
    v_anterior, v_venc_anterior, v_assinatura,
    coalesce(p ->> 'arquivo_nome', ''), coalesce(p ->> 'arquivo_formato', ''), coalesce(p ->> 'observacao', ''), v_autor
  );

  insert into public.fin_fatura_cartao_item (
    client_ref, fatura_ref, ordem, data_compra, descricao, parcela_num, parcela_total, valor, tipo,
    categoria_ref, categoria_origem, purchase_ref, casamento
  )
  select
    i.client_ref, v_ref, i.ordem, i.data_compra, i.descricao, i.parcela_num, i.parcela_total, i.valor, i.tipo,
    i.categoria_ref, coalesce(i.categoria_origem, 'REGRA'), i.purchase_ref, i.casamento
  from jsonb_to_recordset(coalesce(p -> 'itens', '[]'::jsonb)) as i (
    client_ref text, ordem integer, data_compra date, descricao text, parcela_num integer, parcela_total integer,
    valor numeric, tipo text, categoria_ref text, categoria_origem text, purchase_ref text, casamento text
  );

  perform public.write_audit_event(
    'financeiro.fatura_cartao.importar',
    'fin_fatura_cartao',
    v_ref,
    jsonb_build_object('cartao', v_cartao, 'mes', v_mes, 'total', v_total, 'conta', v_expense, 'acao', v_acao, 'valor_anterior', v_anterior)
  );
  return v_ref;
end;
$$;

revoke all on function public.fin_fatura_confirmar(jsonb) from public, anon;
grant execute on function public.fin_fatura_confirmar(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Desfazer: a fatura sai, a conta a pagar fica (com o total que já tem)
-- ---------------------------------------------------------------------------
create or replace function public.fin_fatura_desfazer(p_ref text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_autor uuid;
begin
  if not public.is_financeiro_full(auth.uid()) then
    raise exception 'SEM_PERMISSAO: só o financeiro completo desfaz a importação.' using errcode = '42501';
  end if;
  select c.id into v_autor from public.colaborador c where c.auth_id = auth.uid() and c.ativo = true limit 1;
  update public.fin_fatura_cartao_item set deleted_at = now() where fatura_ref = p_ref and deleted_at is null;
  update public.fin_fatura_cartao set deleted_at = now(), deleted_by = v_autor where client_ref = p_ref and deleted_at is null;
  if not found then
    raise exception 'FATURA_NAO_ENCONTRADA: esta importação já tinha sido desfeita.';
  end if;
  perform public.write_audit_event('financeiro.fatura_cartao.desfazer', 'fin_fatura_cartao', p_ref, '{}'::jsonb);
end;
$$;

revoke all on function public.fin_fatura_desfazer(text) from public, anon;
grant execute on function public.fin_fatura_desfazer(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Rateio para a P12 / Painel / Lucro
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER para entregar SÓ a soma por categoria (sem estabelecimento)
-- a quem já vê a P12 — assim o gestor e a concierge enxergam o mesmo número que
-- o Lucas. A checagem de quem pode ver fica dentro da função.
create or replace function public.fin_fatura_rateio(p_ano integer)
returns table (expense_ref text, categoria_ref text, valor numeric)
language sql
stable
security definer
set search_path = public
as $$
  select f.expense_ref,
         coalesce(i.categoria_ref, 'cat-fatura-cartao-credito') as categoria_ref,
         sum(i.valor)::numeric(12, 2) as valor
  from public.fin_fatura_cartao f
  join public.fin_fatura_cartao_item i on i.fatura_ref = f.client_ref and i.deleted_at is null
  join public.fin_expenses e on e.client_ref = f.expense_ref and e.deleted_at is null
  where f.deleted_at is null
    and i.tipo <> 'PAGAMENTO'
    and extract(year from e.due_date) = p_ano
    and (
      public.is_coordenacao(auth.uid())
      or public.is_financeiro_full(auth.uid())
      or coalesce(public.module_access_override(auth.uid(), 'fin-p12') in ('VER', 'EDITAR'), false)
      or coalesce(public.module_access_override(auth.uid(), 'fin-gestao') in ('VER', 'EDITAR'), false)
      or coalesce(public.module_access_override(auth.uid(), 'fin-lucro') in ('VER', 'EDITAR'), false)
    )
  group by f.expense_ref, coalesce(i.categoria_ref, 'cat-fatura-cartao-credito')
$$;

revoke all on function public.fin_fatura_rateio(integer) from public, anon;
grant execute on function public.fin_fatura_rateio(integer) to authenticated;
