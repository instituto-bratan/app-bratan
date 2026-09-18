-- A nota REPARTIDA pode ter uma nota de bioimpedância (18/09/2026).
--
-- O CHECK original de nfse_emissao.tipo só aceitava CONSULTA, TRATAMENTO e
-- UNIFICADA. Mas a regra da casa — conferida nas notas reais 6203/6204/6205 —
-- reparte em até TRÊS notas, e a do meio é a bioimpedância (código 04030).
-- Sem este valor, a tela de fechamento montaria o plano certo e o insert
-- estouraria na hora de gravar, com o fechamento já feito.
alter table nfse_emissao drop constraint if exists nfse_emissao_tipo_check;
alter table nfse_emissao add constraint nfse_emissao_tipo_check
  check (tipo = any (array['CONSULTA', 'BIOIMPEDANCIA', 'TRATAMENTO', 'UNIFICADA']));
