-- A COMPRA SABE DE QUAL ITEM DO ESTOQUE ELA É (21/09/2026)
--
-- Lucas: *"eu tenho dificuldade de anotar quando eu compro e aí eu me perco no
-- controle se está chegando, se eu já comprei ou não."*
--
-- A causa: o estoque marcava COMPRAR olhando só o saldo. Comprada a medicação,
-- o item continuava gritando COMPRAR até a caixa chegar fisicamente e alguém
-- dar entrada — então a lista não distinguia "falta comprar" de "já comprei,
-- está vindo". Daí o comprar duas vezes, ou o não comprar por dúvida.
--
-- `estoque_setor` já dizia PARA ONDE a compra vai; faltava dizer DE QUE ITEM
-- ela é. Sem essa coluna, a ligação teria que ser adivinhada pelo texto da
-- descrição — e adivinhação em controle de estoque vira compra duplicada.
alter table public.fin_purchases add column if not exists estoque_item_ref text;

comment on column public.fin_purchases.estoque_item_ref is
  'Item do estoque que esta compra repõe. Preenchido = o item aparece como "a caminho" em vez de "comprar".';
