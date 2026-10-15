-- DR. MOISÉS NO INSTITUTO (15/10/2026).
--
-- Lucas: "agora a gente vai ter o Dr. Moisés, que ele também vai atender aqui no
-- Instituto. Então a gente vai precisar diferenciar o dinheiro que está entrando
-- do Dr. Daniel e o dinheiro que está entrando do Dr. Moisés... para a gente
-- saber qual que vai ser o salário do Dr. Moisés e qual que está sendo o salário
-- do Dr. Daniel".
--
--   1. fin_sale_items.profissional: quem executa o item. Vazio = Dr. Daniel (é o
--      que vale para todas as comandas até outubro de 2026). O app grava 'daniel'
--      ou 'moises'; o banco só confere o formato — um profissional novo não pode
--      depender de trocar CHECK (a lição do program_phase de 24/07: valor novo no
--      motor com CHECK velho no banco derrubava o lote inteiro).
--   2. Categoria própria para os pagamentos ao Dr. Moisés (baixa das parcelas
--      dele no Lucro Inteligente), separada da do Dr. Daniel.
--
-- Nada é reescrito: as linhas antigas ficam com profissional nulo (= Dr. Daniel).

alter table public.fin_sale_items add column if not exists profissional text;

alter table public.fin_sale_items drop constraint if exists fin_sale_items_profissional_formato;
alter table public.fin_sale_items
  add constraint fin_sale_items_profissional_formato
  check (profissional is null or profissional ~ '^[a-z][a-z0-9_-]{1,30}$');

comment on column public.fin_sale_items.profissional is
  'Quem executa o item (15/10/2026): daniel | moises. Nulo = Dr. Daniel (comandas até out/2026). É de onde sai o salário de cada um no Lucro Inteligente.';

insert into public.fin_categories (client_ref, group_key, name, sort_order, is_capex) values
  ('cat-lucro-inteligente-moises', 'MAO_DE_OBRA', 'Lucro Inteligente — Dr. Moisés (biomédico, transferência)', 16, false)
on conflict (client_ref) do update set name = excluded.name, group_key = excluded.group_key;
