-- LUCRO INTELIGENTE É "A MAIS" (Lucas, 10/09/2026): salário fixo do médico,
-- salário da CEO e pró-labore ficam no Contas a Pagar como conta fixa e NÃO
-- abatem os envelopes. As transferências do Lucro Inteligente ganham categoria
-- própria — assim o Lucro, o Contas a Pagar e a P12 contam o mesmo dinheiro sem
-- misturar com os salários.
insert into public.fin_categories (client_ref, group_key, name, sort_order, is_capex) values
  ('cat-lucro-inteligente-medico', 'MAO_DE_OBRA', 'Lucro Inteligente — médico executor (transferência)', 15, false),
  ('cat-lucro-inteligente-socios', 'POUPANCA', 'Lucro Inteligente — sócios (transferência)', 11, false)
on conflict (client_ref) do update set name = excluded.name, group_key = excluded.group_key;
