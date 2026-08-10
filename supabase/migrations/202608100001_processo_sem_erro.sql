-- PROCESSO À PROVA DE ERRO (10/08/2026, pedido do Lucas: "está tendo muito erro
-- ... quero taxa de acerto quase nula de erro, mais revisão, mas sem tornar o
-- processo mais difícil").
--
-- Diagnóstico dos 3 buracos que causaram TODOS os erros achados na semana:
--   1. A comanda e o comprovante não se conheciam → "sem comprovante" era
--      invisível, e não dava para saber se ESQUECERAM ou se NÃO ENTROU.
--   2. O fechamento do dia comparava o app com o app: não havia "quanto eu
--      contei de verdade". Julho fechou com R$ 0,00 de dinheiro enquanto havia
--      R$ 31.250 na gaveta, e a taxa de cartão de 28/07 saiu a 24%.
--   3. O extrato do banco nunca entrava no app: a única fonte que não mente
--      ficava fora, e a conferência dependia de alguém lembrar de fazer.

-- ===========================================================================
-- 1. COMPROVANTE AMARRADO AO PAGAMENTO DA COMANDA
-- ===========================================================================
-- Estado explícito por forma de pagamento. PENDENTE é o padrão (ninguém decidiu
-- ainda); AGUARDANDO é "o paciente vai mandar depois"; NAO_SE_APLICA é dinheiro
-- na gaveta. Só ANEXADO tem arquivo.
alter table public.fin_sale_payments
  add column if not exists comprovante_status text not null default 'PENDENTE'
    check (comprovante_status in ('PENDENTE', 'ANEXADO', 'AGUARDANDO', 'NAO_SE_APLICA')),
  add column if not exists comprovante_ref text;

comment on column public.fin_sale_payments.comprovante_status is
  'PENDENTE (ninguém decidiu) · ANEXADO (tem arquivo) · AGUARDANDO (paciente manda depois) · NAO_SE_APLICA (dinheiro). 10/08/2026.';

-- O comprovante passa a saber de qual comanda/pagamento ele é.
alter table public.comprovante
  add column if not exists sale_ref text,
  add column if not exists sale_payment_ref text;

create index if not exists idx_comprovante_sale_ref on public.comprovante(sale_ref);

-- Quem pagou, quando é diferente do paciente (o Mauricio pagou pela Ariane e a
-- conciliação acusou falso erro). Preenchido só na exceção.
alter table public.fin_sales
  add column if not exists payer_name text;

-- ===========================================================================
-- 2. FECHAMENTO DO DIA COM CONTAGEM REAL
-- ===========================================================================
-- O que a recepção CONTOU, para comparar com o que as comandas dizem.
alter table public.fin_reconciliations
  add column if not exists counted_dinheiro numeric(14,2),
  add column if not exists counted_card numeric(14,2),
  add column if not exists counted_pix numeric(14,2);

comment on column public.fin_reconciliations.counted_dinheiro is
  'Dinheiro contado na gaveta no fim do dia. Comparado com as comandas em dinheiro. 10/08/2026.';

-- ===========================================================================
-- 3. EXTRATO DO BANCO DENTRO DO APP
-- ===========================================================================
-- Uma linha por lançamento do extrato. O client_ref é determinístico
-- (data + valor + descrição), então importar o mesmo arquivo duas vezes não
-- duplica nada.
create table if not exists public.fin_bank_entry (
  id uuid primary key default gen_random_uuid(),
  client_ref text unique not null,
  entry_date date not null,
  description text not null default '',
  counterparty text not null default '',
  document text not null default '',
  amount numeric(14,2) not null,
  balance numeric(14,2),
  source text not null default 'ITAU',
  -- Conciliação: com o que essa linha casou.
  match_kind text check (match_kind in ('COMANDA', 'DESPESA', 'COFRE', 'IGNORADO')),
  match_ref text,
  match_note text,
  matched_by uuid references public.colaborador(id) on delete set null,
  matched_at timestamptz,
  imported_at timestamptz not null default now(),
  imported_by uuid references public.colaborador(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fin_bank_entry_date on public.fin_bank_entry(entry_date desc);
create index if not exists idx_fin_bank_entry_match on public.fin_bank_entry(match_kind);

comment on table public.fin_bank_entry is
  'Extrato do banco importado. A régua da conciliação: o que entrou/saiu de verdade. client_ref determinístico impede duplicar na reimportação. 10/08/2026.';

alter table public.fin_bank_entry enable row level security;

drop policy if exists "fin_bank_entry_select" on public.fin_bank_entry;
create policy "fin_bank_entry_select" on public.fin_bank_entry
for select to authenticated using (public.is_coordenacao(auth.uid()));

drop policy if exists "fin_bank_entry_write" on public.fin_bank_entry;
create policy "fin_bank_entry_write" on public.fin_bank_entry
for all to authenticated
using (public.is_financeiro_full(auth.uid()) or public.module_access_override(auth.uid(), 'fin-extrato') = 'EDITAR')
with check (public.is_financeiro_full(auth.uid()) or public.module_access_override(auth.uid(), 'fin-extrato') = 'EDITAR');

-- ===========================================================================
-- 4. Backfill honesto: comandas antigas em DINHEIRO não precisam de comprovante.
--    O resto fica PENDENTE de propósito — é informação que ninguém deu ainda,
--    e inventar "anexado" seria mentira.
-- ===========================================================================
update public.fin_sale_payments
   set comprovante_status = 'NAO_SE_APLICA'
 where method = 'DINHEIRO' and comprovante_status = 'PENDENTE';
