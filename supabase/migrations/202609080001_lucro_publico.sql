-- LUCRO INTELIGENTE · resumo público do mês (08/09/2026, pedido do Lucas:
-- "deixe exposto na tela inicial para todo mundo o card Cabe gastar no mês").
-- As comandas (fin_sales) só a coordenação lê; este resumo é um retrato
-- agregado, publicado pela tela do Lucro Inteligente, que qualquer pessoa
-- logada pode ler. Sem paciente, sem comanda: só os números do envelope.
create table if not exists public.fin_lucro_publico (
  month_key text primary key,
  dia_ref date not null,
  entrou_liquido numeric(14,2) not null default 0,
  cabe_gastar numeric(14,2) not null default 0,
  contas_pagas numeric(14,2) not null default 0,
  sobra numeric(14,2) not null default 0,
  lucro_hoje numeric(14,2) not null default 0,
  lucro_mes numeric(14,2) not null default 0,
  lucro_meta numeric(14,2) not null default 0,
  medico_hoje numeric(14,2) not null default 0,
  medico_mes numeric(14,2) not null default 0,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
alter table public.fin_lucro_publico enable row level security;
drop policy if exists fin_lucro_publico_select on public.fin_lucro_publico;
create policy fin_lucro_publico_select on public.fin_lucro_publico for select to authenticated using (true);
drop policy if exists fin_lucro_publico_write on public.fin_lucro_publico;
create policy fin_lucro_publico_write on public.fin_lucro_publico for all to authenticated
  using (is_financeiro_full(auth.uid()) or module_access_override(auth.uid(), 'fin-lucro') = 'EDITAR')
  with check (is_financeiro_full(auth.uid()) or module_access_override(auth.uid(), 'fin-lucro') = 'EDITAR');
grant select, insert, update on public.fin_lucro_publico to authenticated;
