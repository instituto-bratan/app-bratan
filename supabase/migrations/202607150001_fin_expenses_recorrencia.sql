-- Contas a pagar recorrentes: "MENSAL" repete todo mês (o app materializa a
-- cópia do mês seguinte com client_ref determinístico `<raiz>~rec-YYYY-MM`).
alter table public.fin_expenses
  add column if not exists recurrence text check (recurrence in ('MENSAL'));
