-- Crediário no lucro do mês (31/07/2026, pedido do Lucas).
--
-- O caixa do crediário (dinheiro vivo) fica FORA da P12 de propósito. Mas às
-- vezes o gestor quer reconhecer esse dinheiro como parte do lucro de um mês
-- específico — "só quando eu apertar o botão", nunca automático em todo mês.
--
-- Cada linha aqui é UMA decisão: mês, valor incorporado, quem apertou e quando.
-- O id determinístico (crediario-lucro-YYYY-MM) impede incorporar duas vezes o
-- mesmo mês em aparelhos diferentes. Desfazer é soft delete: o histórico fica.
create table if not exists public.fin_crediario_profit (
  id uuid primary key default gen_random_uuid(),
  client_ref text unique,
  month_ref text not null check (month_ref ~ '^\d{4}-\d{2}$'),
  amount numeric(14,2) not null check (amount > 0),
  note text not null default '',
  included_by uuid references public.colaborador(id) on delete set null,
  included_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fin_crediario_profit_month on public.fin_crediario_profit(month_ref);

alter table public.fin_crediario_profit enable row level security;

-- Ver: quem já vê o Financeiro. Mexer: só quem manda no Financeiro (Dr. Daniel,
-- CEO, gestor financeiro) ou quem tiver exceção EDITAR na tela do Crediário —
-- é decisão de resultado, não lançamento de rotina.
drop policy if exists "fin_crediario_profit_select" on public.fin_crediario_profit;
create policy "fin_crediario_profit_select" on public.fin_crediario_profit
for select to authenticated using (public.is_coordenacao(auth.uid()));

drop policy if exists "fin_crediario_profit_write" on public.fin_crediario_profit;
create policy "fin_crediario_profit_write" on public.fin_crediario_profit
for all to authenticated
using (
  public.is_financeiro_full(auth.uid())
  or public.module_access_override(auth.uid(), 'fin-crediario') = 'EDITAR'
)
with check (
  public.is_financeiro_full(auth.uid())
  or public.module_access_override(auth.uid(), 'fin-crediario') = 'EDITAR'
);

comment on table public.fin_crediario_profit is
  'Decisão manual de somar o caixa do crediário no lucro de um mês. Nunca automático: uma linha por mês, com valor, autor e data. Desfazer = deleted_at.';
