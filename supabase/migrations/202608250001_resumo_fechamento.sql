-- RESUMO DE FECHAMENTO (25/08/2026, pedido do Lucas): o documento
-- "RESUMO DE FECHAMENTO JULHO" que ele leva para a reunião do fechamento vira
-- tela — sem aba nova, dentro do Painel do Mês, que já é a tela da reunião.
--
-- A linha do mês em fin_gestao_mensal já guarda o que é ESCRITO por gente
-- (explicações, PDCA). Este campo guarda a mesma coisa para o resumo: os saldos
-- que só quem olha o banco sabe, os acordos da reunião e o lucro distribuído.
-- Os números calculáveis (entrada, saída, meta, provisões, 80/20) NUNCA são
-- gravados aqui — continuam derivados dos lançamentos.
alter table public.fin_gestao_mensal add column if not exists fechamento jsonb not null default '{}'::jsonb;

comment on column public.fin_gestao_mensal.fechamento is
  'Resumo de Fechamento: saldos das contas, adiantamentos, acordos da reunião e distribuição de lucro (80% Andrya / 20% Daniel). Só o que é digitado por gente. 25/08/2026.';
