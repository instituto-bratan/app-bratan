-- A NOTA QUE LEVA O SINAL JUNTO (29/09/2026).
--
-- Regra do Lucas: o sinal de consulta não emite nota; ele entra somado na nota
-- da consulta ou do tratamento, quando o paciente passa. A nota continua sendo
-- de UMA comanda (a do dia), mas passa a cobrir também a(s) comanda(s) de
-- sinal. As partes ficam guardadas aqui para o controle de impostos registrar
-- uma linha por comanda — e o sinal sair da lista "sem nota".
alter table public.nfse_emissao add column if not exists partes jsonb;
comment on column public.nfse_emissao.partes is 'Comandas cobertas por esta nota além da principal (sinais somados): [{saleRef, amount, invoiceType, comandaDate, patientName}]. Nulo = só a comanda da nota.';
