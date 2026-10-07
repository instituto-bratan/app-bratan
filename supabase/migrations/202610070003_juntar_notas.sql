-- JUNTAR NOTAS DE DOIS PACIENTES (07/10/2026, pedido do Lucas)
--
-- "Quando é necessário juntar duas notas fiscais de dois pacientes — mãe e
--  filho — a gente junta as duas comandas numa nota só, com o valor somado,
--  no nome de um desses dois."
--
-- A emissão (focus-nfse) passou a aceitar `juntar`: as outras comandas entram
-- como PARTES da nota do titular (o controle de impostos registra uma linha por
-- comanda, como já fazia com o sinal). Quem não emite (desde 202610070001 só o
-- Estevão emite) deixa a nota juntada PRONTA no lote, para quem emite — então o
-- lote precisa aceitar item novo pelo app. Até hoje os itens do lote nasciam
-- só por SQL.
--
-- Quem cria item no lote: o financeiro completo e quem emite; sempre PENDENTE
-- (o status muda pela emissão). Idempotente.

drop policy if exists nfse_lote_insert on public.nfse_lote_item;
create policy nfse_lote_insert on public.nfse_lote_item
  for insert to authenticated
  with check ((public.is_financeiro_full(auth.uid()) or public.pode_emitir_nota(auth.uid())) and status = 'PENDENTE');
