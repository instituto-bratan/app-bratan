-- ESTOQUE v2 (19/08/2026): código de barras no item. O leitor USB ("maquininha
-- do bip") é um teclado — bipa, digita o código e dá Enter. Nas caixas de
-- medicação do Brasil o DataMatrix (padrão GS1/ANVISA) carrega GTIN + validade
-- + lote: bipar na entrada preenche tudo sozinho. O parse é do app; aqui só o
-- campo e o índice de busca.
alter table public.estoque_item add column if not exists codigo_barras text not null default '';
create index if not exists idx_estoque_item_codigo on public.estoque_item(codigo_barras) where codigo_barras <> '';
